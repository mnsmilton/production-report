import express from 'express';
import multer from 'multer';
import QRCode from 'qrcode';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db, dirs, getSettings, saveSettings } from './db.js';
import { processMedia, deleteMediaFiles } from './media.js';
import * as paypal from './paypal.js';
import { sendDownloadEmail, notifyAdmin } from './mail.js';
import { quote, toColones } from './pricing.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' });
  next();
});

const id = (n = 9) => crypto.randomBytes(n).toString('base64url');
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const publicPage = (name) => (req, res) => res.sendFile(path.join(config.root, 'public', name));

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
const safeEq = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());
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
  if (!safeEq(String(req.body?.password ?? ''), config.adminPassword)) return res.status(401).json({ error: 'Contraseña incorrecta' });
  const exp = String(Date.now() + 7 * 86400_000);
  res.cookie('admin', `${exp}.${sign(exp)}`, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 7 * 86400_000, path: '/' });
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { res.clearCookie('admin'); res.json({ ok: true }); });
app.get('/api/admin/me', (req, res) => res.json({ admin: isAdmin(req) }));

// ---------- helpers ----------
const cleanText = (v, max) => String(v ?? '').trim().slice(0, max);
const cleanDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
const cleanPrice = (v) => {
  const n = Math.round(Number(v) * 100);
  return Number.isFinite(n) && n >= 100 && n <= 100000 ? n : config.defaultPriceCents;
};
const sessionCode = () => Array.from(crypto.randomBytes(6), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
/** Teléfono para wa.me: 8 dígitos = Costa Rica (+506); si no, número internacional. */
function normPhone(v) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = '506' + d;
  return d.length >= 10 && d.length <= 15 ? d : '';
}

function publicMedia(m) {
  return {
    id: m.id, kind: m.kind, title: m.title, spot: m.spot, shot_date: m.shot_date, session: m.session_code,
    price_cents: m.price_cents, width: m.width, height: m.height, duration: m.duration,
    thumb: m.thumb_file && `/media/${m.thumb_file}`, preview: m.preview_file && `/media/${m.preview_file}`,
  };
}
const sessionView = (s) => ({
  code: s.code, name: s.name, spot: s.spot, shot_date: s.shot_date, all_price_cents: s.all_price_cents,
  count: db.prepare(`SELECT COUNT(*) c FROM media WHERE session_code=? AND status='ready' AND active=1`).get(s.code).c,
  url: `${config.baseUrl}/s/${s.code}`,
});

// ---------- sesiones (admin) ----------
app.get('/api/admin/sessions', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM sessions ORDER BY shot_date DESC, created_at DESC').all().map(sessionView));
});
app.post('/api/admin/sessions', requireAdmin, (req, res) => {
  const name = cleanText(req.body?.name, 100);
  if (!name) return res.status(400).json({ error: 'Pon un nombre a la sesión.' });
  const s = { code: sessionCode(), name, spot: cleanText(req.body?.spot, 80), shot_date: cleanDate(req.body?.shot_date),
    all_price_cents: req.body?.all_price ? cleanPrice(req.body.all_price) : null };
  db.prepare('INSERT INTO sessions (code, name, spot, shot_date, all_price_cents) VALUES (?,?,?,?,?)').run(s.code, s.name, s.spot, s.shot_date, s.all_price_cents);
  res.status(201).json(sessionView(s));
});
app.patch('/api/admin/sessions/:code', requireAdmin, (req, res) => {
  const s = db.prepare('SELECT * FROM sessions WHERE code=?').get(req.params.code);
  if (!s) return res.status(404).json({ error: 'No existe' });
  const b = req.body || {};
  const n = {
    name: 'name' in b ? cleanText(b.name, 100) || s.name : s.name,
    spot: 'spot' in b ? cleanText(b.spot, 80) : s.spot,
    shot_date: 'shot_date' in b ? cleanDate(b.shot_date) : s.shot_date,
    all: 'all_price' in b ? (b.all_price ? cleanPrice(b.all_price) : null) : s.all_price_cents,
  };
  db.prepare('UPDATE sessions SET name=?, spot=?, shot_date=?, all_price_cents=? WHERE code=?').run(n.name, n.spot, n.shot_date, n.all, s.code);
  db.prepare('UPDATE media SET spot=?, shot_date=? WHERE session_code=?').run(n.spot, n.shot_date, s.code);
  res.json({ ok: true });
});
app.delete('/api/admin/sessions/:code', requireAdmin, (req, res) => {
  if (db.prepare('SELECT COUNT(*) c FROM media WHERE session_code=?').get(req.params.code).c) {
    return res.status(409).json({ error: 'La sesión aún tiene fotos o videos. Bórralos primero.' });
  }
  db.prepare('DELETE FROM sessions WHERE code=?').run(req.params.code);
  res.json({ ok: true });
});

// ---------- configuración de precios (admin) ----------
app.get('/api/admin/settings', requireAdmin, (req, res) => res.json(getSettings()));
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const packs = Array.isArray(req.body?.packs) ? req.body.packs
    .map((p) => ({ qty: Math.floor(Number(p.qty)), price_cents: Math.round(Number(p.price) * 100) }))
    .filter((p) => p.qty >= 2 && p.qty <= 100 && p.price_cents >= 100) : undefined;
  const rate = Number(req.body?.sinpeRate);
  saveSettings({ packs, sinpeRate: rate > 0 && rate < 5000 ? rate : undefined });
  res.json(getSettings());
});

// ---------- subida (admin) ----------
const PHOTO = /^image\/(jpeg|png|webp)$/;
const VIDEO = /^video\/(mp4|quicktime|webm|x-m4v)$/;
const EXT_KIND = { '.jpg': 'photo', '.jpeg': 'photo', '.png': 'photo', '.webp': 'photo', '.mp4': 'video', '.m4v': 'video', '.mov': 'video', '.webm': 'video' };
// Algunos móviles envían application/octet-stream: se recurre a la extensión.
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

app.post('/api/admin/media', requireAdmin, upload.array('files', 50), wrap(async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'Sube fotos (JPG/PNG/WebP) o videos (MP4/MOV/WebM).' });
  const session = req.body.session ? db.prepare('SELECT * FROM sessions WHERE code=?').get(String(req.body.session)) : null;
  const spot = session ? session.spot : cleanText(req.body.spot, 80);
  const shotDate = session ? session.shot_date : cleanDate(req.body.shot_date);
  const price = cleanPrice(req.body.price);
  const title = cleanText(req.body.title, 120);
  const ins = db.prepare(`INSERT INTO media (id, session_code, kind, title, spot, shot_date, price_cents, original_file, original_name)
                          VALUES (?,?,?,?,?,?,?,?,?)`);
  const rows = files.map((f) => {
    const row = { id: id(8), session_code: session?.code ?? null, kind: kindOf(f), title, spot, shot_date: shotDate,
      price_cents: price, original_file: f.filename, original_name: f.originalname.slice(0, 200) };
    ins.run(row.id, row.session_code, row.kind, row.title, row.spot, row.shot_date, row.price_cents, row.original_file, row.original_name);
    return row;
  });
  (async () => { for (const r of rows) await processMedia(r); })();
  res.status(202).json({ queued: rows.length });
}));

app.get('/api/admin/media', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT m.*, s.name AS session_name,
      (SELECT COUNT(*) FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.media_id = m.id AND o.status='paid') AS sales
    FROM media m LEFT JOIN sessions s ON s.code = m.session_code ORDER BY m.created_at DESC, m.rowid DESC`).all();
  res.json(rows.map((m) => ({ ...publicMedia(m), status: m.status, active: !!m.active, sales: m.sales, original_name: m.original_name, session_name: m.session_name })));
});

app.patch('/api/admin/media/:id', requireAdmin, (req, res) => {
  const m = db.prepare('SELECT * FROM media WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'No existe' });
  const b = req.body || {};
  db.prepare('UPDATE media SET title=?, price_cents=?, active=? WHERE id=?').run(
    'title' in b ? cleanText(b.title, 120) : m.title,
    'price' in b ? cleanPrice(b.price) : m.price_cents,
    'active' in b ? (b.active ? 1 : 0) : m.active, m.id);
  res.json({ ok: true });
});

app.delete('/api/admin/media/:id', requireAdmin, wrap(async (req, res) => {
  const m = db.prepare('SELECT * FROM media WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'No existe' });
  if (db.prepare('SELECT COUNT(*) c FROM order_items WHERE media_id=?').get(m.id).c) { // los clientes que pagaron conservan su descarga
    db.prepare('UPDATE media SET active=0 WHERE id=?').run(m.id);
    return res.json({ hidden: true });
  }
  await deleteMediaFiles(m);
  db.prepare('DELETE FROM media WHERE id=?').run(m.id);
  res.json({ deleted: true });
}));

// ---------- pedidos (admin) ----------
const orderRow = (o) => {
  const items = db.prepare(`SELECT m.title, m.kind, m.thumb_file FROM order_items i JOIN media m ON m.id=i.media_id WHERE i.order_id=?`).all(o.id);
  return {
    id: o.id, email: o.email, phone: o.phone, method: o.method, status: o.status, reference: o.reference, payer_note: o.payer_note,
    amount_cents: o.amount_cents, amount_crc: o.amount_crc, created_at: o.created_at, paid_at: o.paid_at, count: items.length,
    thumb: items[0]?.thumb_file ? `/media/${items[0].thumb_file}` : null, titles: items.map((i) => i.title || (i.kind === 'video' ? 'Video' : 'Foto')).slice(0, 3),
    whatsapp: o.status === 'paid' && o.phone ? waLink(o) : null,
  };
};
function waLink(o) {
  const msg = `¡Gracias por tu compra en ${config.brand}! 🤙 Descarga tus fotos/videos originales aquí:\n${config.baseUrl}/d/${o.download_token}`;
  return `https://wa.me/${o.phone}?text=${encodeURIComponent(msg)}`;
}

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const open = db.prepare(`SELECT * FROM orders WHERE status IN ('pending','reported') AND method='sinpe' ORDER BY (status='reported') DESC, created_at DESC LIMIT 200`).all().map(orderRow);
  const paid = db.prepare(`SELECT * FROM orders WHERE status='paid' ORDER BY paid_at DESC LIMIT 300`).all().map(orderRow);
  res.json({ open, paid, total_cents: paid.reduce((s, o) => s + o.amount_cents, 0), count: paid.length });
});
app.post('/api/admin/orders/:id/confirm', requireAdmin, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!o || o.method !== 'sinpe' || o.status === 'cancelled') return res.status(404).json({ error: 'Pedido no encontrado' });
  markPaid(o);
  res.json(orderRow(db.prepare('SELECT * FROM orders WHERE id=?').get(o.id)));
});
app.post('/api/admin/orders/:id/cancel', requireAdmin, (req, res) => {
  db.prepare(`UPDATE orders SET status='cancelled' WHERE id=? AND status IN ('pending','reported')`).run(req.params.id);
  res.json({ ok: true });
});

// ---------- público: configuración, galería, sesiones ----------
app.get('/api/config', (req, res) => {
  const s = getSettings();
  res.json({
    brand: config.brand, tagline: config.tagline, whatsapp: config.whatsapp, instagram: config.instagram,
    currency: config.currency, defaultPriceCents: config.defaultPriceCents, packs: s.packs,
    paypalClientId: config.paypal.enabled ? config.paypal.clientId : null,
    sinpe: config.sinpe.number ? { number: config.sinpe.number, name: config.sinpe.name, rate: s.sinpeRate } : null,
    demoPayments: config.demoPayments, maxDownloads: config.maxDownloads, downloadDays: config.downloadDays,
  });
});

app.get('/api/media', (req, res) => {
  const where = [`status='ready'`, 'active=1'];
  const args = [];
  if (req.query.session) { where.push('session_code=?'); args.push(String(req.query.session)); }
  if (req.query.spot) { where.push('spot=?'); args.push(String(req.query.spot)); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '')) { where.push('shot_date=?'); args.push(req.query.date); }
  if (['photo', 'video'].includes(req.query.kind)) { where.push('kind=?'); args.push(req.query.kind); }
  res.json(db.prepare(`SELECT * FROM media WHERE ${where.join(' AND ')} ORDER BY shot_date DESC, created_at DESC, rowid DESC LIMIT 500`).all(...args).map(publicMedia));
});

app.get('/api/filters', (req, res) => {
  const base = `FROM media WHERE status='ready' AND active=1`;
  res.json({
    spots: db.prepare(`SELECT DISTINCT spot ${base} AND spot<>'' ORDER BY spot`).all().map((r) => r.spot),
    dates: db.prepare(`SELECT DISTINCT shot_date ${base} AND shot_date<>'' ORDER BY shot_date DESC LIMIT 60`).all().map((r) => r.shot_date),
    sessions: db.prepare(`SELECT code, name, shot_date FROM sessions s WHERE EXISTS (SELECT 1 ${base} AND session_code=s.code) ORDER BY shot_date DESC, created_at DESC LIMIT 100`).all(),
  });
});

app.get('/api/sessions/:code', (req, res) => {
  const s = db.prepare('SELECT * FROM sessions WHERE code=?').get(req.params.code);
  if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
  const { code, name, spot, shot_date, all_price_cents, count, url } = sessionView(s);
  res.json({ code, name, spot, shot_date, all_price_cents, count, url });
});

// QR de una página de este mismo sitio (para tarjetas impresas)
app.get('/api/qr.svg', wrap(async (req, res) => {
  const p = String(req.query.path || '/');
  if (!/^\/[\w\-/]{0,60}$/.test(p)) return res.status(400).end();
  res.type('image/svg+xml').send(await QRCode.toString(config.baseUrl + p, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }));
}));
app.get('/s/:code', publicPage('index.html'));
app.get('/card/:code', publicPage('card.html'));

app.use('/media', express.static(dirs.public, { maxAge: '7d', immutable: true, index: false, dotfiles: 'deny' }));

// ---------- carrito y precios ----------
function loadCart(ids) {
  const unique = [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, 100);
  if (!unique.length) return [];
  return db.prepare(`SELECT id, price_cents, session_code FROM media WHERE status='ready' AND active=1 AND id IN (${unique.map(() => '?').join(',')})`).all(...unique);
}
function priceCart(items) {
  const sessions = new Map();
  for (const code of new Set(items.map((i) => i.session_code).filter(Boolean))) {
    const s = db.prepare('SELECT * FROM sessions WHERE code=?').get(code);
    if (s) sessions.set(code, { all_price_cents: s.all_price_cents, count: sessionView(s).count });
  }
  const q = quote(items, getSettings().packs, sessions);
  const { sinpeRate } = getSettings();
  return { ...q, total_crc: toColones(q.total_cents, sinpeRate) };
}

app.post('/api/quote', limit('quote', 120, 10 * 60_000), (req, res) => {
  const items = loadCart(req.body?.ids);
  res.json({ ids: items.map((i) => i.id), ...priceCart(items) });
});

// ---------- checkout ----------
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

app.post('/api/checkout', limit('checkout', 20, 10 * 60_000), wrap(async (req, res) => {
  const email = cleanText(req.body?.email, 254).toLowerCase();
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'Correo inválido' });
  const items = loadCart(req.body?.ids);
  if (!items.length) return res.status(400).json({ error: 'El carrito está vacío' });
  const phone = normPhone(req.body?.phone);
  const method = String(req.body?.method);
  const q = priceCart(items);

  const orderId = id(14);
  let providerOrderId = null; let reference = null; let crc = null; let actual = method;
  if (method === 'sinpe') {
    if (!config.sinpe.number) return res.status(503).json({ error: 'SINPE Móvil aún no está configurado.' });
    crc = q.total_crc;
    for (let i = 0; i < 20 && !reference; i++) {
      const r = 'CH' + String(1000 + crypto.randomInt(9000));
      if (!db.prepare(`SELECT 1 FROM orders WHERE reference=? AND status IN ('pending','reported')`).get(r)) reference = r;
    }
  } else if (method === 'paypal' && config.paypal.enabled) {
    providerOrderId = await paypal.createOrder({ orderId, amountCents: q.total_cents, description: `${config.brand} – ${items.length} archivo(s)` });
  } else if (config.demoPayments && (method === 'demo' || method === 'paypal')) {
    actual = 'demo';
  } else {
    return res.status(503).json({ error: 'Ese método de pago no está disponible.' });
  }

  db.exec('BEGIN');
  try {
    db.prepare(`INSERT INTO orders (id, email, phone, amount_cents, amount_crc, currency, method, provider_order_id, reference) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(orderId, email, phone, q.total_cents, crc, config.currency, actual, providerOrderId, reference);
    const ins = db.prepare('INSERT INTO order_items (order_id, media_id, price_cents) VALUES (?,?,?)');
    for (const i of items) ins.run(orderId, i.id, i.price_cents);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  res.json({ orderId, paypalOrderId: providerOrderId, method: actual });
}));

function markPaid(order) {
  if (order.status === 'paid') return order.download_token;
  const token = id(24);
  const expires = new Date(Date.now() + config.downloadDays * 86400_000).toISOString();
  db.prepare(`UPDATE orders SET status='paid', download_token=?, expires_at=?, paid_at=datetime('now') WHERE id=? AND status IN ('pending','reported')`).run(token, expires, order.id);
  const fresh = db.prepare('SELECT * FROM orders WHERE id=?').get(order.id);
  const n = db.prepare('SELECT COUNT(*) c FROM order_items WHERE order_id=?').get(order.id).c;
  sendDownloadEmail({ to: order.email, title: `${n} archivo(s)`, url: `${config.baseUrl}/d/${fresh.download_token}` }).catch((e) => console.error('Email falló:', e.message));
  return fresh.download_token;
}
const getOrder = (oid) => db.prepare('SELECT * FROM orders WHERE id=?').get(String(oid));

app.post('/api/checkout/:id/capture', limit('capture', 30, 10 * 60_000), wrap(async (req, res) => {
  const o = getOrder(req.params.id);
  if (!o || o.method !== 'paypal') return res.status(404).json({ error: 'Orden no encontrada' });
  if (o.status !== 'paid') {
    if (!(await paypal.captureAndVerify(o.provider_order_id, o.amount_cents))) return res.status(402).json({ error: 'No se pudo confirmar el pago.' });
  }
  markPaid(o);
  res.json({ next: `/o/${o.id}` });
}));

app.post('/api/checkout/:id/demo-pay', (req, res) => {
  const o = getOrder(req.params.id);
  if (!config.demoPayments || !o || o.method !== 'demo') return res.status(404).json({ error: 'No disponible' });
  markPaid(o);
  res.json({ next: `/o/${o.id}` });
});

// El cliente avisa que ya hizo el SINPE; no libera nada: el fotógrafo confirma en su panel.
app.post('/api/orders/:id/reported', limit('reported', 20, 10 * 60_000), (req, res) => {
  const o = getOrder(req.params.id);
  if (!o || o.method !== 'sinpe' || !['pending', 'reported'].includes(o.status)) return res.status(404).json({ error: 'Pedido no encontrado' });
  const note = cleanText(req.body?.note, 120);
  db.prepare(`UPDATE orders SET status='reported', payer_note=?, reported_at=datetime('now') WHERE id=?`).run(note, o.id);
  if (o.status === 'pending') notifyAdmin(`Pago SINPE reportado ${o.reference}`, `₡${o.amount_crc} · ${o.email} · ${note}\n${config.baseUrl}/admin`).catch(() => {});
  res.json({ ok: true });
});

// Estado del pedido (la página /o/:id lo consulta hasta que el pago se confirma)
app.get('/o/:id', publicPage('order.html'));
app.get('/api/orders/:id', (req, res) => {
  const o = getOrder(req.params.id);
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado' });
  const items = db.prepare(`SELECT m.id, m.title, m.kind, m.thumb_file FROM order_items i JOIN media m ON m.id=i.media_id WHERE i.order_id=?`).all(o.id)
    .map((m) => ({ id: m.id, title: m.title, kind: m.kind, thumb: m.thumb_file && `/media/${m.thumb_file}` }));
  const sinpe = o.method === 'sinpe' ? { number: config.sinpe.number, name: config.sinpe.name, reference: o.reference, amount_crc: o.amount_crc } : null;
  res.json({ status: o.status, method: o.method, amount_cents: o.amount_cents, items, sinpe,
    download: o.status === 'paid' ? `/d/${o.download_token}` : null, whatsapp: config.whatsapp });
});

// ---------- descargas del cliente ----------
const paidByToken = (token) => {
  const o = db.prepare(`SELECT * FROM orders WHERE download_token=? AND status='paid'`).get(String(token));
  if (!o) return { error: 404 };
  if (new Date(o.expires_at) < new Date()) return { error: 410 };
  return { o };
};

app.get('/d/:token', publicPage('download.html'));

app.get('/api/downloads/:token', (req, res) => {
  const { o, error } = paidByToken(req.params.token);
  if (error) return res.status(error).json({ error: error === 410 ? 'Este enlace expiró.' : 'Enlace no válido.' });
  const items = db.prepare(`SELECT m.id, m.title, m.kind, m.thumb_file, i.downloads FROM order_items i JOIN media m ON m.id=i.media_id WHERE i.order_id=?`).all(o.id)
    .map((m) => ({ id: m.id, title: m.title, kind: m.kind, thumb: m.thumb_file && `/media/${m.thumb_file}`, remaining: Math.max(0, config.maxDownloads - m.downloads) }));
  res.json({ items, expires_at: o.expires_at, link: `${config.baseUrl}/d/${req.params.token}`, brand: config.brand });
});

app.get('/d/:token/:mediaId', (req, res) => {
  const { o, error } = paidByToken(req.params.token);
  if (error) return res.status(error).send(error === 410 ? 'Enlace expirado' : 'Enlace no válido');
  const it = db.prepare('SELECT * FROM order_items WHERE order_id=? AND media_id=?').get(o.id, String(req.params.mediaId));
  if (!it) return res.status(404).send('Archivo no encontrado');
  if (it.downloads >= config.maxDownloads) return res.status(403).send('Límite de descargas alcanzado. Escríbenos y te ayudamos.');
  const m = db.prepare('SELECT * FROM media WHERE id=?').get(it.media_id);
  const file = path.join(dirs.originals, m.original_file);
  if (!fs.existsSync(file)) return res.status(404).send('Archivo no encontrado');
  db.prepare('UPDATE order_items SET downloads=downloads+1 WHERE order_id=? AND media_id=?').run(o.id, m.id);
  const name = `${config.brand}-${m.title || m.id}`.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + path.extname(m.original_file);
  res.download(file, name);
});

// ---------- estáticos y errores ----------
app.get('/admin', publicPage('admin.html'));
app.use(express.static(path.join(config.root, 'public'), { index: 'index.html', extensions: ['html'] }));

app.use((err, req, res, next) => {
  console.error(err);
  if (err instanceof multer.MulterError) return res.status(400).json({ error: `Subida rechazada: ${err.message}` });
  res.status(500).json({ error: 'Error del servidor' });
});

(async () => { // reanuda el procesamiento si el servidor se reinició a mitad de una subida
  for (const r of db.prepare(`SELECT * FROM media WHERE status='processing'`).all()) await processMedia(r);
})();

app.listen(config.port, () => {
  console.log(`${config.brand} → ${config.baseUrl}  (admin: /admin)`);
  console.log([config.paypal.enabled ? `PayPal (${config.paypal.live ? 'LIVE' : 'sandbox'})` : null, config.sinpe.number ? 'SINPE Móvil' : null,
    config.demoPayments ? 'DEMO (pagos simulados)' : null].filter(Boolean).join(' + ') || 'Pagos: NO configurados');
});
