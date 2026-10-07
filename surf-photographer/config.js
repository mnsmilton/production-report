import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile(new URL('./.env', import.meta.url)); } catch { /* .env es opcional */ }

const e = process.env;
const root = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  root,
  port: Number(e.PORT) || 3000,
  baseUrl: (e.BASE_URL || `http://localhost:${Number(e.PORT) || 3000}`).replace(/\/$/, ''),
  production: e.NODE_ENV === 'production',
  dataDir: path.resolve(e.DATA_DIR || path.join(root, 'data')),

  brand: e.BRAND_NAME || 'Chonfotos',
  tagline: e.TAGLINE || 'Costa Rica · Fotografía y video de surf',
  whatsapp: (e.WHATSAPP || '').replace(/[^\d]/g, ''),
  instagram: e.INSTAGRAM || '',

  currency: (e.CURRENCY || 'USD').toUpperCase(),
  defaultPriceCents: Math.round(Number(e.DEFAULT_PRICE || 20) * 100),
  maxDownloads: Number(e.MAX_DOWNLOADS) || 10,
  downloadDays: Number(e.DOWNLOAD_DAYS) || 30,
  maxUploadMb: Number(e.MAX_UPLOAD_MB) || 2000,

  adminPassword: e.ADMIN_PASSWORD || '',
  sessionSecret: e.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),

  paypal: {
    clientId: e.PAYPAL_CLIENT_ID || '',
    secret: e.PAYPAL_SECRET || '',
    live: (e.PAYPAL_ENV || 'sandbox') === 'live',
  },
  // Pago simulado: solo para probar sin PayPal. Nunca activo si hay credenciales o en producción.
  demoPayments: e.DEMO_PAYMENTS === '1' && e.NODE_ENV !== 'production',

  smtp: {
    host: e.SMTP_HOST || '',
    port: Number(e.SMTP_PORT) || 587,
    user: e.SMTP_USER || '',
    pass: e.SMTP_PASS || '',
    from: e.SMTP_FROM || '',
  },

  ffmpeg: e.FFMPEG_PATH || 'ffmpeg',
  ffprobe: e.FFPROBE_PATH || 'ffprobe',
};

config.paypal.enabled = Boolean(config.paypal.clientId && config.paypal.secret);
if (config.paypal.enabled) config.demoPayments = false;

if (!config.adminPassword) {
  if (config.production) {
    console.error('Falta ADMIN_PASSWORD. Defínela en las variables de entorno.');
    process.exit(1);
  }
  config.adminPassword = crypto.randomBytes(6).toString('hex');
  console.warn(`ADMIN_PASSWORD no definida; contraseña temporal para esta sesión: ${config.adminPassword}`);
}
