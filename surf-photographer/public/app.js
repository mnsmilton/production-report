const T = {
  es: {
    hero_sub: 'Encuentra tu ola. Descarga tu foto o video original en alta calidad por solo el precio de un café en la playa.',
    hero_cta: 'Ver galería', f_spot: 'Playa / spot', f_date: 'Fecha', all_spots: 'Todas las playas', all_dates: 'Todas las fechas',
    k_all: 'Todo', k_photo: 'Fotos', k_video: 'Videos',
    hint: 'Las vistas previas llevan marca de agua. Al pagar descargas el original sin marca, en resolución completa.',
    empty: 'Aún no hay contenido para este filtro.', photo: 'Foto', video: 'Video',
    b1: 'Archivo original, sin marca de agua', b2: 'Descarga inmediata tras el pago', b3: (d, n) => `Enlace válido ${d} días · hasta ${n} descargas`,
    buy: (p) => `Comprar ${p}`, email_label: 'Correo para recibir tu enlace', continue: 'Continuar al pago',
    demo: (p) => `Pagar ${p} (simulado)`, creating: 'Preparando pago…', paid: 'Pago confirmado. Redirigiendo…',
    pay_err: 'No se pudo completar el pago. Intenta de nuevo.', no_pay: 'Los pagos aún no están disponibles.',
    help: 'Escríbenos por WhatsApp si no encuentras tu foto', untitled: 'Sesión de surf',
  },
  en: {
    hero_sub: 'Find your wave. Download your original full-quality photo or video for the price of a beach coffee.',
    hero_cta: 'Browse gallery', f_spot: 'Beach / spot', f_date: 'Date', all_spots: 'All beaches', all_dates: 'All dates',
    k_all: 'All', k_photo: 'Photos', k_video: 'Videos',
    hint: 'Previews are watermarked. After payment you download the original, unwatermarked, in full resolution.',
    empty: 'Nothing here yet for this filter.', photo: 'Photo', video: 'Video',
    b1: 'Original file, no watermark', b2: 'Instant download after payment', b3: (d, n) => `Link valid ${d} days · up to ${n} downloads`,
    buy: (p) => `Buy ${p}`, email_label: 'Email to receive your link', continue: 'Continue to payment',
    demo: (p) => `Pay ${p} (simulated)`, creating: 'Preparing payment…', paid: 'Payment confirmed. Redirecting…',
    pay_err: 'Payment could not be completed. Please try again.', no_pay: 'Payments are not available yet.',
    help: "Message us on WhatsApp if you can't find your photo", untitled: 'Surf session',
  },
};
let lang = localStorage.getItem('lang') || ((navigator.language || 'es').startsWith('en') ? 'en' : 'es');
const t = (k, ...a) => (typeof T[lang][k] === 'function' ? T[lang][k](...a) : T[lang][k]);
const $ = (s) => document.querySelector(s);
const money = (c, cur) => new Intl.NumberFormat(lang === 'es' ? 'es-CR' : 'en-US', { style: 'currency', currency: cur, minimumFractionDigits: c % 100 ? 2 : 0 }).format(c / 100);

let cfg, items = [], current = null, filtersLoaded = false;
const state = { spot: '', date: '', kind: '' };

const api = async (url, opts) => {
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.lang === lang));
  if (cfg) {
    $('#h1').textContent = cfg.brand;
    $('#b3').textContent = t('b3', cfg.downloadDays, cfg.maxDownloads);
    renderFilters();
    render();
    renderFooter();
  }
}

let filterData = { spots: [], dates: [] };
function renderFilters() {
  const spot = $('#fSpot'); const date = $('#fDate');
  spot.replaceChildren(new Option(t('all_spots'), ''), ...filterData.spots.map((s) => new Option(s, s)));
  date.replaceChildren(new Option(t('all_dates'), ''), ...filterData.dates.map((d) => new Option(new Date(d + 'T12:00').toLocaleDateString(lang === 'es' ? 'es-CR' : 'en-US', { dateStyle: 'medium' }), d)));
  spot.value = state.spot; date.value = state.date;
}

function renderFooter() {
  const f = $('#foot'); f.replaceChildren();
  const add = (txt, href) => {
    if (f.childNodes.length) f.append(' · ');
    if (href) { const a = document.createElement('a'); a.href = href; a.textContent = txt; a.rel = 'noopener'; a.target = '_blank'; f.append(a); } else f.append(txt);
  };
  add(`© ${new Date().getFullYear()} ${cfg.brand}`);
  if (cfg.whatsapp) add(t('help'), `https://wa.me/${cfg.whatsapp}`);
  if (cfg.instagram) add('Instagram', `https://instagram.com/${cfg.instagram.replace(/^@/, '')}`);
}

function fmtDate(d) { return d ? new Date(d + 'T12:00').toLocaleDateString(lang === 'es' ? 'es-CR' : 'en-US', { dateStyle: 'medium' }) : ''; }
const label = (m) => m.title || t('untitled');

function render() {
  const grid = $('#grid');
  if (!items.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = t('empty'); grid.replaceChildren(p); return; }
  grid.replaceChildren(...items.map((m) => {
    const b = document.createElement('button');
    b.className = 'card'; b.type = 'button';
    const ph = document.createElement('div'); ph.className = 'ph';
    const img = new Image(); img.src = m.thumb; img.alt = label(m); img.loading = 'lazy'; ph.append(img);
    const meta = document.createElement('div'); meta.className = 'meta';
    const left = document.createElement('div');
    const s = document.createElement('strong'); s.textContent = label(m);
    const sm = document.createElement('small'); sm.textContent = [m.spot, fmtDate(m.shot_date)].filter(Boolean).join(' · ');
    left.append(s, sm);
    const price = document.createElement('span'); price.className = 'price'; price.textContent = money(m.price_cents, cfg.currency);
    meta.append(left, price);
    b.append(ph, meta);
    if (m.kind === 'video') { const bd = document.createElement('span'); bd.className = 'badge'; bd.textContent = '▶ ' + t('video'); b.append(bd); }
    b.addEventListener('click', () => openItem(m));
    return b;
  }));
}

async function load() {
  const q = new URLSearchParams(Object.entries(state).filter(([, v]) => v));
  items = await api('/api/media?' + q);
  render();
}

// ---------- modal / compra ----------
const dlg = $('#dlg');
let paypalLoaded = null;

function openItem(m) {
  current = m;
  const stage = $('#stage'); stage.replaceChildren();
  if (m.kind === 'video') {
    const v = document.createElement('video');
    v.src = m.preview; v.poster = m.thumb; v.controls = true; v.playsInline = true; v.preload = 'metadata';
    v.setAttribute('controlslist', 'nodownload'); v.addEventListener('contextmenu', (e) => e.preventDefault());
    stage.append(v);
  } else {
    const i = new Image(); i.src = m.preview; i.alt = label(m); i.draggable = false; i.addEventListener('contextmenu', (e) => e.preventDefault()); stage.append(i);
  }
  $('#mTitle').textContent = label(m);
  $('#mSub').textContent = [m.kind === 'video' ? t('video') : t('photo'), m.spot, fmtDate(m.shot_date)].filter(Boolean).join(' · ');
  $('#buyBtn').textContent = t('buy', money(m.price_cents, cfg.currency));
  $('#buyStep').hidden = false; $('#emailStep').hidden = true; $('#paypal-box').replaceChildren();
  $('#msg').textContent = ''; $('#msg').className = 'msg';
  if (!dlg.open) dlg.showModal();
}

const say = (txt, cls = '') => { const m = $('#msg'); m.textContent = txt; m.className = 'msg ' + cls; };

function loadPayPal() {
  paypalLoaded ??= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.paypalClientId)}&currency=${cfg.currency}&intent=capture&components=buttons`;
    s.onload = res; s.onerror = () => { paypalLoaded = null; rej(new Error('PayPal')); };
    document.head.append(s);
  });
  return paypalLoaded;
}

async function startCheckout(email) {
  return api('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mediaId: current.id, email }) });
}

$('#buyBtn').addEventListener('click', async () => {
  $('#buyStep').hidden = true; $('#emailStep').hidden = false;
  if (cfg.paypalClientId) {
    $('#goBtn').hidden = true;
    const email = $('#email');
    try {
      await loadPayPal();
      window.paypal.Buttons({
        style: { layout: 'vertical', shape: 'pill', label: 'pay' },
        onClick: (_d, actions) => (email.checkValidity() ? actions.resolve() : (email.reportValidity(), actions.reject())),
        createOrder: async () => { say(t('creating')); const r = await startCheckout(email.value); current.orderId = r.orderId; return r.paypalOrderId; },
        onApprove: async () => {
          const r = await api(`/api/checkout/${current.orderId}/capture`, { method: 'POST' });
          say(t('paid'), 'ok'); location.href = r.downloadUrl;
        },
        onError: () => say(t('pay_err'), 'err'),
        onCancel: () => say(''),
      }).render('#paypal-box');
    } catch { say(t('pay_err'), 'err'); }
  } else if (cfg.demoPayments) {
    $('#goBtn').hidden = true; $('#demoBtn').hidden = false; $('#demoBtn').textContent = t('demo', money(current.price_cents, cfg.currency));
  } else {
    $('#goBtn').hidden = true; say(t('no_pay'), 'err');
  }
});

$('#emailStep').addEventListener('submit', (e) => e.preventDefault());
$('#demoBtn').addEventListener('click', async () => {
  const email = $('#email'); if (!email.reportValidity()) return;
  $('#demoBtn').disabled = true;
  try {
    const r = await startCheckout(email.value);
    const p = await api(`/api/checkout/${r.orderId}/demo-pay`, { method: 'POST' });
    say(t('paid'), 'ok'); location.href = p.downloadUrl;
  } catch (err) { say(err.message, 'err'); $('#demoBtn').disabled = false; }
});

$('#dlgClose').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener('close', () => $('#stage').replaceChildren());

// ---------- filtros e idioma ----------
$('#fSpot').addEventListener('change', (e) => { state.spot = e.target.value; load(); });
$('#fDate').addEventListener('change', (e) => { state.date = e.target.value; load(); });
document.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => {
  state.kind = b.dataset.kind;
  document.querySelectorAll('[data-kind]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  load();
}));
document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
  lang = b.dataset.lang; localStorage.setItem('lang', lang); applyLang();
}));

(async () => {
  cfg = await api('/api/config');
  document.title = `${cfg.brand} – ${cfg.tagline}`;
  $('#logo').textContent = cfg.brand;
  filterData = await api('/api/filters');
  applyLang();
  await load();
})();
