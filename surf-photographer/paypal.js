import { config } from './config.js';

const api = () => (config.paypal.live ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');
let cached = { token: '', exp: 0 };

async function token() {
  if (cached.token && Date.now() < cached.exp) return cached.token;
  const auth = Buffer.from(`${config.paypal.clientId}:${config.paypal.secret}`).toString('base64');
  const res = await fetch(`${api()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal auth ${res.status}`);
  const j = await res.json();
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return cached.token;
}

async function call(method, path, body, requestId) {
  const res = await fetch(`${api()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/json',
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

const fmt = (cents) => (cents / 100).toFixed(2);

export async function createOrder({ orderId, amountCents, description }) {
  const r = await call('POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: orderId,
      description: description.slice(0, 120),
      amount: { currency_code: config.currency, value: fmt(amountCents) },
    }],
  }, `create-${orderId}`);
  if (!r.ok) throw new Error(`PayPal create ${r.status}: ${JSON.stringify(r.json)}`);
  return r.json.id;
}

/** Captura el pago y confirma que monto y moneda coinciden con lo esperado. */
export async function captureAndVerify(paypalOrderId, amountCents) {
  let r = await call('POST', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, null, `capture-${paypalOrderId}`);
  if (!r.ok) r = await call('GET', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`); // p. ej. ya capturada
  if (!r.ok) return false;
  if (r.json.status !== 'COMPLETED') return false;
  const cap = r.json.purchase_units?.[0]?.payments?.captures?.[0];
  return Boolean(cap) && cap.status === 'COMPLETED'
    && cap.amount?.currency_code === config.currency
    && cap.amount?.value === fmt(amountCents);
}
