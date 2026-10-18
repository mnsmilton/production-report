# Chonfotos – galería de surf con marca de agua y venta de descargas

Sitio para un fotógrafo de surf: sube fotos/videos, se publican **con marca de agua**, y el cliente paga (por defecto **$20 USD**) para descargar el **original sin marca**.

## Cómo funciona
1. **Sesiones** (`/admin`): cada salida (playa + fecha) es una sesión con su **enlace propio** (`/s/<código>`) y una **tarjeta con QR imprimible** (`/card/<código>`) para repartir en la playa. También hay un QR del sitio completo.
2. **Subida**: el fotógrafo arrastra fotos (JPG/PNG/WebP) o videos (MP4/MOV/WebM) a una sesión. El original queda en una carpeta **privada** y se genera la vista previa **con marca de agua** y una miniatura.
3. **Galería pública** (`/`): filtros por sesión, playa, fecha y foto/video; ES/EN; botón **+** para armar el carrito; compartir la sesión por WhatsApp.
4. **Carrito y paquetes**: precio por archivo (por defecto $20) + paquetes editables (ej. 3 por $50, 5 por $75) + precio opcional de **toda la sesión**. El servidor calcula siempre el mejor precio para el cliente.
5. **Pago**
   - **SINPE Móvil** (locales): el cliente ve el monto en colones, tu número y una referencia (CH1234). Transfiere y pulsa "Ya hice el pago". Tú ves el pedido en el panel, verificas en tu app del banco y pulsas **Confirmar pago**. El tipo de cambio se edita en el panel.
   - **PayPal / tarjeta** (turistas, USD): se captura el pago y el servidor **verifica monto y moneda** antes de entregar nada.
6. **Entrega**: enlace `/d/<token>` con todos los archivos del pedido (30 días, 10 descargas por archivo). Se envía por correo (si hay SMTP) y por **WhatsApp**: al confirmar un SINPE el panel abre un chat de WhatsApp con el mensaje y el enlace listos para enviar; el cliente también puede enviarse el enlace a sí mismo. (Es "clic para enviar"; el envío 100 % automático requiere la API de WhatsApp Business, de pago.)

Los originales nunca se sirven por URL pública; solo `/d/<token>/<archivo>` tras un pago verificado o confirmado.

## Correr
```bash
npm install
cp .env.example .env     # edita contraseña, marca y credenciales
npm start                # http://localhost:3000
```
Requiere **Node ≥ 22.13** (usa `node:sqlite`) y **ffmpeg/ffprobe** instalados (videos). Para probar sin PayPal: `DEMO_PAYMENTS=1 npm start` (pago simulado; desactivado en producción).

## Pagos en Costa Rica
SINPE Móvil: define `SINPE_NUMBER`, `SINPE_NAME` y `SINPE_RATE` en `.env`. Stripe no abre cuentas directamente en Costa Rica; por eso se usa **PayPal** (sí disponible, acepta tarjetas como invitado). Crea una app en developer.paypal.com, prueba en `sandbox` y luego pon `PAYPAL_ENV=live` con las credenciales reales. Si prefieres otra pasarela (Tilopay, ONVO, SINPE Móvil), solo hay que reemplazar `paypal.js` y los endpoints `/api/checkout*`.

## Despliegue
Necesita un servidor con disco persistente (Render/Railway con volumen, VPS, Fly.io). Guarda `DATA_DIR` (base SQLite + archivos) en el volumen y haz respaldos. Detrás de Cloudflare el límite de subida es ~100 MB por petición: sube videos grandes saltándote el proxy o por un subdominio sin proxy. Usa HTTPS (la cookie de admin se marca `secure` automáticamente).

## Estructura
`server.js` rutas · `media.js` marca de agua (sharp + ffmpeg) · `paypal.js` pagos · `db.js` SQLite · `public/` interfaz.
