# Chonfotos – galería de surf con marca de agua y venta de descargas

Sitio para un fotógrafo de surf: sube fotos/videos, se publican **con marca de agua**, y el cliente paga (por defecto **$20 USD**) para descargar el **original sin marca**.

## Cómo funciona
1. **Admin** (`/admin`, con contraseña): arrastra fotos (JPG/PNG/WebP) o videos (MP4/MOV/WebM), indica playa, fecha y precio.
2. El servidor guarda el original en una carpeta **privada** y genera una vista previa con marca de agua (fotos: 1600 px; videos: 720p-ish sin audio) y miniatura.
3. **Galería pública** (`/`): filtros por playa, fecha, foto/video. ES/EN.
4. **Compra**: el cliente pone su correo y paga con PayPal (tarjeta o cuenta). El servidor captura el pago y **verifica monto y moneda** antes de entregar nada.
5. **Descarga**: enlace `/d/<token>` (por defecto 30 días, 10 descargas); también se envía por correo si configuras SMTP.

Los originales nunca se sirven por URL pública; solo `/d/<token>/file` tras un pago verificado.

## Correr
```bash
npm install
cp .env.example .env     # edita contraseña, marca y credenciales
npm start                # http://localhost:3000
```
Requiere **Node ≥ 22.13** (usa `node:sqlite`) y **ffmpeg/ffprobe** instalados (videos). Para probar sin PayPal: `DEMO_PAYMENTS=1 npm start` (pago simulado; desactivado en producción).

## Pagos en Costa Rica
Stripe no abre cuentas directamente en Costa Rica; por eso se usa **PayPal** (sí disponible, acepta tarjetas como invitado). Crea una app en developer.paypal.com, prueba en `sandbox` y luego pon `PAYPAL_ENV=live` con las credenciales reales. Si prefieres otra pasarela (Tilopay, ONVO, SINPE Móvil), solo hay que reemplazar `paypal.js` y los endpoints `/api/checkout*`.

## Despliegue
Necesita un servidor con disco persistente (Render/Railway con volumen, VPS, Fly.io). Guarda `DATA_DIR` (base SQLite + archivos) en el volumen y haz respaldos. Detrás de Cloudflare el límite de subida es ~100 MB por petición: sube videos grandes saltándote el proxy o por un subdominio sin proxy. Usa HTTPS (la cookie de admin se marca `secure` automáticamente).

## Estructura
`server.js` rutas · `media.js` marca de agua (sharp + ffmpeg) · `paypal.js` pagos · `db.js` SQLite · `public/` interfaz.
