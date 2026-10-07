import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { config } from './config.js';
import { db, dirs } from './db.js';

const run = promisify(execFile);
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** PNG transparente con la marca de agua repetida en diagonal. */
export function watermarkPng(width, height, { tiled = true, centerSize = Math.round(Math.min(width, height) / 9) } = {}) {
  const label = esc(config.brand.toUpperCase());
  const tile = 340;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <pattern id="p" width="${tile}" height="${tile * 0.7}" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
        <text x="${tile / 2}" y="${tile * 0.35}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif"
          font-size="26" font-weight="700" letter-spacing="3" fill="#fff" fill-opacity="0.5"
          stroke="#000" stroke-opacity="0.35" stroke-width="1">${label}</text>
      </pattern>
    </defs>
    ${tiled ? '<rect width="100%" height="100%" fill="url(#p)"/>' : ''}
    <text x="50%" y="52%" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif"
      font-size="${centerSize}" font-weight="800" fill="#fff" fill-opacity="0.38"
      stroke="#000" stroke-opacity="0.25" stroke-width="2">${label}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function processPhoto(id, originalPath) {
  const base = sharp(originalPath, { failOn: 'error' }).rotate();
  const resized = await base.resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
  const { width, height } = resized.info;
  const wm = await watermarkPng(width, height);
  const previewFile = `${id}.jpg`;
  const preview = await sharp(resized.data).composite([{ input: wm }]).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  await fs.writeFile(path.join(dirs.public, previewFile), preview);
  const thumbFile = `${id}-t.jpg`;
  await sharp(preview).resize(640, 640, { fit: 'inside' }).jpeg({ quality: 72 }).toFile(path.join(dirs.public, thumbFile));
  const meta = await sharp(originalPath).rotate().metadata();
  const rotated = (meta.orientation ?? 1) >= 5;
  return {
    previewFile, thumbFile,
    width: rotated ? meta.height : meta.width,
    height: rotated ? meta.width : meta.height,
    duration: null,
  };
}

async function processVideo(id, originalPath) {
  const { stdout } = await run(config.ffprobe, ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration', '-of', 'json', originalPath]);
  const info = JSON.parse(stdout);
  const duration = Number(info.format?.duration) || 0;
  const stream = info.streams?.[0];
  if (!stream) throw new Error('El archivo no contiene video');

  const wmFile = path.join(dirs.tmp, `${id}-wm.png`);
  const centerFile = path.join(dirs.tmp, `${id}-wc.png`);
  await fs.writeFile(wmFile, await watermarkPng(1280, 1280, { centerSize: 0 }));
  await fs.writeFile(centerFile, await watermarkPng(900, 120, { tiled: false, centerSize: 64 }));
  const previewFile = `${id}.mp4`;
  const previewPath = path.join(dirs.public, previewFile);
  try {
    await run(config.ffmpeg, ['-y', '-v', 'error', '-i', originalPath, '-i', wmFile, '-i', centerFile,
      '-filter_complex',
      '[0:v]scale=w=1280:h=1280:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[v];[v][1:v]overlay=0:0:format=auto[w];[w][2:v]overlay=(W-w)/2:(H-h)/2:format=auto',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', '-an', previewPath], { maxBuffer: 1 << 24 });

    const frame = path.join(dirs.tmp, `${id}-f.jpg`);
    await run(config.ffmpeg, ['-y', '-v', 'error', '-ss', String(Math.min(1, duration / 2)), '-i', previewPath, '-frames:v', '1', frame]);
    const thumbFile = `${id}-t.jpg`;
    await sharp(frame).resize(640, 640, { fit: 'inside' }).jpeg({ quality: 72 }).toFile(path.join(dirs.public, thumbFile));
    await fs.rm(frame, { force: true });
    return { previewFile, thumbFile, width: stream.width, height: stream.height, duration };
  } finally {
    await fs.rm(wmFile, { force: true });
    await fs.rm(centerFile, { force: true });
  }
}

/** Genera vista previa con marca de agua en segundo plano y actualiza el registro. */
export async function processMedia(row) {
  const originalPath = path.join(dirs.originals, row.original_file);
  try {
    const r = row.kind === 'photo' ? await processPhoto(row.id, originalPath) : await processVideo(row.id, originalPath);
    db.prepare(`UPDATE media SET preview_file=?, thumb_file=?, width=?, height=?, duration=?, status='ready' WHERE id=?`)
      .run(r.previewFile, r.thumbFile, r.width, r.height, r.duration, row.id);
  } catch (err) {
    console.error(`Error procesando ${row.id}:`, err.message);
    db.prepare(`UPDATE media SET status='failed' WHERE id=?`).run(row.id);
  }
}

export async function deleteMediaFiles(row) {
  const files = [path.join(dirs.originals, row.original_file)];
  if (row.preview_file) files.push(path.join(dirs.public, row.preview_file));
  if (row.thumb_file) files.push(path.join(dirs.public, row.thumb_file));
  await Promise.all(files.map((f) => fs.rm(f, { force: true })));
}
