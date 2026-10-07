import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db, dirs } from './db.js';
import { processMedia, deleteMediaFiles } from './media.js';
import * as paypal from './paypal.js';
import { sendDownloadEmail } from './mail.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
  });
  next();
});

const id = (n = 9) => crypto.randomBytes(n).toString('base64url');
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- límite de intentos simple en memoria ----------
const hits = new Map();
const limit = (name, max, windowMs) => (req, res, next) => {
  const key = `${name}:${req.ip}`;
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return res.status(429).json({ error: 'Demasiados intentos, espera un momento.' });
  arr.push(now);
  hits.set(key, arr);
  next();
};
setInterval(() => hits.clear(), 3600_000).unref();

// ---------- sesión de administrador (cookie firmada) ----------
const sign = (v) => crypto.createHmac('sha256', config.sessionSecret).update(v).digest('base64url');
const safeEq = (a, b) => {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map((c) => {
  const i = c.indexOf('=');
  return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
}));
const isAdmin = (req) => {
  const [exp, sig] = (cookies(req).admin || '').split('.');
  return Boolean(exp && sig && Number(exp) > Date.now() && safeEq(sig, sign(exp)));
};
const requireAdmin = (req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ error: 'No autorizado' }));

app.post('/api/admin/login', limit('login', 8, 15 * 60_000), (req, res) => {
  const pw = String(req.body?.password ?? '');
  if (!safeEq(pw, config.adminPassword)) return res.status(401).json({ error: 'Contraseña incorrecta' });
  const exp = String(Date.now() + 7 * 86400_000);
  res.cookie('admin', `${exp}.${sign(exp)}`, {
    httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 7 * 86400_000, path: '/',
  });
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { res.clearCookie('admin'); res.json({ ok: true }); });
app.get('/api/admin/me', (req, res) => res.json({ admin: isAdmin(req) }));

// ---------- subida (admin) ----------
const PHOTO = /^image\/(jpeg|png|webp)$/;
const VIDEO = /^video\/(mp4|quicktime|webm|x-m4v)$/;
const EXT_KIND = { '.jpg': 'photo', '.jpeg': 'photo', '.png': 'photo', '.webp': 'photo', '.mp4': 'video', '.m4v': 'video', '.mov': 'video', '.webm': 'video' };
// Algunos navegadores/móviles envían application/octet-stream: se recurre a la extensión.
const kindOf = (f) => (PHOTO.test(f.mimetype) ? 'photo' : VIDEO.test(f.mimetype) ? 'video'
  : (f.mimetype === 'application/octet-stream' ? EXT_KIND[path.extname(f.originalname).toLowerCase()] : undefined));
const upload = multer({
  storage: multer.diskStorage({
    destination: dirs.originals,
    filename: (req, file, cb) => cb(null, id(12) + path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '')),
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 50 },
  fileFilter: (req, file, cb) => cb(null, Boolean(kindOf(file))),
});

const cleanText = (v, max) => String(v ?? '').trim().slice(0, max);
const cleanDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
const cleanPrice = (v) => {
  const n = Math.round(Number(v) * 100);
  return Number.isFinite(n) && n >= 100 && n <= 100000 ? n : config.defaultPriceCents;
};

app.post('/api/admin/media', requireAdmin, upload.array('files', 50), wrap(async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'Sube fotos (JPG/PNG/WebP) o videos (MP4/MOV/WebM).' });
  const spot = cleanText(req.body.spot, 80);
  const shotDate = cleanDate(req.body.shot_date);
  const price = cleanPrice(req.body.price);
  const title = cleanText(req.body.title, 120);
  const ins = db.prepare(`INSERT INTO media (id, kind, title, spot, shot_date, price_cents, original_file, original_name)
                          VALUES (?,?,?,?,?,?,?,?)`);
  const rows = files.map((f) => {
    const row = {
      id: id(8), kind: kindOf(f), title, spot, shot_date: shotDate,
      price_cents: price, original_file: f.filename, original_name: f.originalname.slice(0, 200),
    };
    ins.run(row.id, row.kind, row.title, row.spot, row.shot_date, row.price_cents, row.original_file, row.original_name);
    return row;
  });
  // Procesa de a uno en segundo plano para no saturar el servidor.
  (async () => { for (const r of rows) await processMedia(r); })();
  res.status(202).json({ queued: rows.length });
}));

app.get('/api/admin/media', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT m.*, (SELECT COUNT(*) FROM orders o WHERE o.media_id = m.id AND o.status='paid') AS sales
    FROM media m ORDER BY m.created_at DESC, m.rowid DESC`).all();
  res.json(rows.map((m) => ({ ...publicMedia(m), status: m.status, active: !!m.active, sales: m.sales, original_name: m.original_name })));
});

app.patch('/api/admin/media/:id', requireAdmin, (req, res) => {
  const m = db.prepare('SELECT * FROM media WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'No existe' });
  const b = req.body || {};
  db.prepare('UPDATE media SET title=?, spot=?, shot_date=?, price_cents=?, active=? WHERE id=?').run(
    'title' in b ? cleanText(b.title, 120) : m.title,
    'spot' in b ? cleanText(b.spot, 80) : m.spot,
    'shot_date' in b ? cleanDate(b.shot_date) : m.shot_date,
    'price' in b ? cleanPrice(b.price) : m.price_cents,
    'active' in b ? (b.active ? 1 : 0) : m.active,
    m.id);
  res.json({ ok: true });
});

app.delete('/api/admin/media/:id', requireAdmin, wrap(async (req, res) => {
  const m = db.prepare('SELECT * FROM media WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'No existe' });
  const sold = db.prepare(`SELECT COUNT(*) c FROM orders WHERE media_id=?`).get(m.id).c;
  if (sold) { // los clientes que pagaron conservan su descarga
    db.prepare('UPDATE media SET active=0 WHERE id=?').run(m.id);
    return res.json({ hidden: true });
  }
  await deleteMediaFiles(m);
  db.prepare('DELETE FROM media WHERE id=?').run(m.id);
  res.json({ deleted: true });
}));

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const orders = db.prepare(`
    SELECT o.id, o.email, o.amount_cents, o.currency, o.provider, o.paid_at, o.downloads, m.title, m.kind, m.thumb_file, m.spot
    FROM orders o JOIN media m ON m.id = o.media_id WHERE o.status='paid' ORDER BY o.paid_at DESC LIMIT 500`).all();
  const total = orders.reduce((s, o) => s + o.amount_cents, 0);
  res.json({ total_cents: total, count: orders.length, orders: orders.map((o) => ({ ...o, thumb: o.thumb_file && `/media/${o.thumb_file}` })) });
});

// ---------- galería pública ----------
function publicMedia(m) {
  return {
    id: m.id, kind: m.kind, title: m.title, spot: m.spot, shot_date: m.shot_date,
    price_cents: m.price_cents, width: m.width, height: m.height, duration: m.duration,
    thumb: m.thumb_file && `/media/${m.thumb_file}`, preview: m.preview_file && `/media/${m.preview_file}`,
  };
}

app.get('/api/config', (req, res) => res.json({
  brand: config.brand, tagline: config.tagline, whatsapp: config.whatsapp, instagram: config.instagram,
  currency: config.currency, defaultPriceCents: config.defaultPriceCents,
  paypalClientId: config.paypal.enabled ? config.paypal.clientId : null,
  demoPayments: config.demoPayments, maxDownloads: config.maxDownloads, downloadDays: config.downloadDays,
}));

app.get('/api/media', (req, res) => {
  const where = [`status='ready'`, 'active=1'];
  const args = [];
  if (req.query.spot) { where.push('spot=?'); args.push(String(req.query.spot)); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '')) { where.push('shot_date=?'); args.push(req.query.date); }
  if (['photo', 'video'].includes(req.query.kind)) { where.push('kind=?'); args.push(req.query.kind); }
  const rows = db.prepare(`SELECT * FROM media WHERE ${where.join(' AND ')} ORDER BY shot_date DESC, created_at DESC, rowid DESC LIMIT 500`).all(...args);
  res.json(rows.map(publicMedia));
});

app.get('/api/filters', (req, res) => {
  const base = `FROM media WHERE status='ready' AND active=1`;
  res.json({
    spots: db.prepare(`SELECT DISTINCT spot ${base} AND spot<>'' ORDER BY spot`).all().map((r) => r.spot),
    dates: db.prepare(`SELECT DISTINCT shot_date ${base} AND shot_date<>'' ORDER BY shot_date DESC LIMIT 60`).all().map((r) => r.shot_date),
  });
});

app.use('/media', express.static(dirs.public, { maxAge: '7d', immutable: true, index: false, dotfiles: 'deny' }));

// ---------- checkout ----------
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

app.post('/api/checkout', limit('checkout', 20, 10 * 60_000), wrap(async (req, res) => {
  const email = cleanText(req.body?.email, 254).toLowerCase();
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'Correo inválido' });
  const m = db.prepare(`SELECT * FROM media WHERE id=? AND status='ready' AND active=1`).get(String(req.body?.mediaId ?? ''));
  if (!m) return res.status(404).json({ error: 'Archivo no disponible' });
  if (!config.paypal.enabled && !config.demoPayments) {
    return res.status(503).json({ error: 'Los pagos aún no están configurados.' });
  }

  const orderId = id(10);
  const provider = config.paypal.enabled ? 'paypal' : 'demo';
  let providerOrderId = null;
  if (provider === 'paypal') {
    providerOrderId = await paypal.createOrder({
      orderId, amountCents: m.price_cents, description: `${config.brand} – ${m.kind === 'video' ? 'Video' : 'Foto'} ${m.title || m.id}`,
    });
  }
  db.prepare(`INSERT INTO orders (id, media_id, email, amount_cents, currency, provider, provider_order_id) VALUES (?,?,?,?,?,?,?)`)
    .run(orderId, m.id, email, m.price_cents, config.currency, provider, providerOrderId);
  res.json({ orderId, paypalOrderId: providerOrderId, demo: provider === 'demo' });
}));

function markPaid(order) {
  if (order.status === 'paid') return order.download_token;
  const token = id(24);
  const expires = new Date(Date.now() + config.downloadDays * 86400_000).toISOString();
  db.prepare(`UPDATE orders SET status='paid', download_token=?, expires_at=?, paid_at=datetime('now') WHERE id=? AND status='pending'`)
    .run(token, expires, order.id);
  const fresh = db.prepare('SELECT * FROM orders WHERE id=?').get(order.id);
  const m = db.prepare('SELECT title FROM media WHERE id=?').get(order.media_id);
  sendDownloadEmail({ to: order.email, title: m?.title, url: `${config.baseUrl}/d/${fresh.download_token}` })
    .catch((e) => console.error('Email falló:', e.message));
  return fresh.download_token;
}

const pendingOrder = (orderId) => db.prepare('SELECT * FROM orders WHERE id=?').get(String(orderId));

app.post('/api/checkout/:id/capture', limit('capture', 30, 10 * 60_000), wrap(async (req, res) => {
  const o = pendingOrder(req.params.id);
  if (!o || o.provider !== 'paypal') return res.status(404).json({ error: 'Orden no encontrada' });
  if (o.status !== 'paid') {
    const ok = await paypal.captureAndVerify(o.provider_order_id, o.amount_cents);
    if (!ok) return res.status(402).json({ error: 'No se pudo confirmar el pago.' });
  }
  res.json({ downloadUrl: `/d/${markPaid(o)}` });
}));

app.post('/api/checkout/:id/demo-pay', (req, res) => {
  const o = pendingOrder(req.params.id);
  if (!config.demoPayments || !o || o.provider !== 'demo') return res.status(404).json({ error: 'No disponible' });
  res.json({ downloadUrl: `/d/${markPaid(o)}` });
});

// ---------- descargas del cliente ----------
const paidByToken = (token) => {
  const o = db.prepare(`SELECT * FROM orders WHERE download_token=? AND status='paid'`).get(String(token));
  if (!o) return { error: 404 };
  if (new Date(o.expires_at) < new Date()) return { error: 410 };
  return { o };
};

app.get('/d/:token', (req, res) => res.sendFile(path.join(config.root, 'public', 'download.html')));

app.get('/api/downloads/:token', (req, res) => {
  const { o, error } = paidByToken(req.params.token);
  if (error) return res.status(error).json({ error: error === 410 ? 'Este enlace expiró.' : 'Enlace no válido.' });
  const m = db.prepare('SELECT * FROM media WHERE id=?').get(o.media_id);
  res.json({
    title: m.title, kind: m.kind, thumb: m.thumb_file && `/media/${m.thumb_file}`,
    remaining: Math.max(0, config.maxDownloads - o.downloads), expires_at: o.expires_at,
  });
});

app.get('/d/:token/file', (req, res) => {
  const { o, error } = paidByToken(req.params.token);
  if (error) return res.status(error).send(error === 410 ? 'Enlace expirado' : 'Enlace no válido');
  if (o.downloads >= config.maxDownloads) return res.status(403).send('Límite de descargas alcanzado. Escríbenos y te ayudamos.');
  const m = db.prepare('SELECT * FROM media WHERE id=?').get(o.media_id);
  const file = path.join(dirs.originals, m.original_file);
  if (!fs.existsSync(file)) return res.status(404).send('Archivo no encontrado');
  db.prepare('UPDATE orders SET downloads=downloads+1 WHERE id=?').run(o.id);
  const ext = path.extname(m.original_file);
  const name = `${config.brand}-${m.title || m.id}`.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + ext;
  res.download(file, name);
});

// ---------- estáticos y errores ----------
app.get('/admin', (req, res) => res.sendFile(path.join(config.root, 'public', 'admin.html')));
app.use(express.static(path.join(config.root, 'public'), { index: 'index.html', extensions: ['html'] }));

app.use((err, req, res, next) => {
  console.error(err);
  if (err instanceof multer.MulterError) return res.status(400).json({ error: `Subida rechazada: ${err.message}` });
  res.status(500).json({ error: 'Error del servidor' });
});

// Reanuda el procesamiento si el servidor se reinició a mitad de una subida.
(async () => {
  for (const r of db.prepare(`SELECT * FROM media WHERE status='processing'`).all()) await processMedia(r);
})();

app.listen(config.port, () => {
  console.log(`${config.brand} → ${config.baseUrl}  (admin: /admin)`);
  console.log(config.paypal.enabled ? `Pagos: PayPal (${config.paypal.live ? 'LIVE' : 'sandbox'})`
    : config.demoPayments ? 'Pagos: MODO DEMO (simulados)' : 'Pagos: NO configurados');
});
