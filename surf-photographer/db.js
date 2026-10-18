import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export const dirs = {
  originals: path.join(config.dataDir, 'originals'), // privado: solo se sirve tras el pago
  public: path.join(config.dataDir, 'public'),       // vistas previas con marca de agua
  tmp: path.join(config.dataDir, 'tmp'),
};
for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });

export const db = new DatabaseSync(path.join(config.dataDir, 'surf.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS sessions (
    code            TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    spot            TEXT NOT NULL DEFAULT '',
    shot_date       TEXT NOT NULL DEFAULT '',
    all_price_cents INTEGER,            -- precio de "toda la sesión" (opcional)
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS media (
    id            TEXT PRIMARY KEY,
    session_code  TEXT REFERENCES sessions(code),
    kind          TEXT NOT NULL CHECK (kind IN ('photo','video')),
    title         TEXT NOT NULL DEFAULT '',
    spot          TEXT NOT NULL DEFAULT '',
    shot_date     TEXT NOT NULL DEFAULT '',
    price_cents   INTEGER NOT NULL,
    original_file TEXT NOT NULL,
    original_name TEXT NOT NULL DEFAULT '',
    preview_file  TEXT,
    thumb_file    TEXT,
    width         INTEGER,
    height        INTEGER,
    duration      REAL,
    status        TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','failed')),
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id                TEXT PRIMARY KEY,
    email             TEXT NOT NULL,
    phone             TEXT NOT NULL DEFAULT '',
    amount_cents      INTEGER NOT NULL,
    amount_crc        INTEGER,
    currency          TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reported','paid','cancelled')),
    method            TEXT NOT NULL CHECK (method IN ('paypal','sinpe','demo')),
    provider_order_id TEXT,
    reference         TEXT,
    payer_note        TEXT NOT NULL DEFAULT '',
    download_token    TEXT UNIQUE,
    expires_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    reported_at       TEXT,
    paid_at           TEXT
  );

  CREATE TABLE IF NOT EXISTS order_items (
    order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    media_id    TEXT NOT NULL REFERENCES media(id),
    price_cents INTEGER NOT NULL,
    downloads   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (order_id, media_id)
  );
  CREATE INDEX IF NOT EXISTS idx_items_media ON order_items(media_id);
`);

export function getSettings() {
  const rows = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
  let packs = config.defaultPacks;
  try { if (rows.packs) packs = JSON.parse(rows.packs); } catch { /* usa los por defecto */ }
  return { packs, sinpeRate: Number(rows.sinpe_rate) || config.sinpe.rate };
}

export function saveSettings({ packs, sinpeRate }) {
  const put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  if (packs) put.run('packs', JSON.stringify(packs));
  if (sinpeRate) put.run('sinpe_rate', String(sinpeRate));
}
