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

  CREATE TABLE IF NOT EXISTS media (
    id            TEXT PRIMARY KEY,
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
    media_id          TEXT NOT NULL REFERENCES media(id),
    email             TEXT NOT NULL,
    amount_cents      INTEGER NOT NULL,
    currency          TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
    provider          TEXT NOT NULL,
    provider_order_id TEXT,
    download_token    TEXT UNIQUE,
    downloads         INTEGER NOT NULL DEFAULT 0,
    expires_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at           TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_orders_media ON orders(media_id);
`);
