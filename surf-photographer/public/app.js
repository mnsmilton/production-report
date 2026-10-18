const T = {
  es: {
    hero_sub: 'Encuentra tu ola. Descarga tu foto o video original en alta calidad, sin marca de agua.',
    hero_cta: 'Ver galería', cart: 'Carrito', cart_title: 'Tu carrito', cart_empty: 'Aún no has agregado nada. Toca el + en tus fotos.',
    f_session: 'Sesión', f_spot: 'Playa / spot', f_date: 'Fecha', all_sessions_opt: 'Todas las sesiones', all_spots: 'Todas las playas', all_dates: 'Todas las fechas',
    k_all: 'Todo', k_photo: 'Fotos', k_video: 'Videos', all_sessions: 'Ver todas las sesiones',
    hint: 'Las vistas previas llevan marca de agua. Al pagar descargas el original sin marca, en resolución completa.',
    empty: 'Aún no hay contenido para este filtro.', photo: 'Foto', video: 'Video', untitled: 'Surf',
    b1: 'Archivo original, sin marca de agua', b2: 'Descarga inmediata al confirmar el pago', b3: (d, n) => `Enlace válido ${d} días · hasta ${n} descargas por archivo`,
    add: 'Agregar al carrito', added: '✓ En el carrito (quitar)', go_cart: 'Ver carrito',
    session_all: (n, p) => (p ? `Toda la sesión (${n}) · ${p}` : `Agregar toda la sesión (${n})`), share_wa: 'Compartir por WhatsApp', copy_link: 'Copiar enlace', copied: '¡Copiado!',
    session_files: (n) => `${n} archivo${n === 1 ? '' : 's'}`,
    pack: (q, p) => `${q} por ${p}`, packs_title: 'Paquetes:',
    upsell: (n, q, p) => `Agrega ${n} más y llévate ${q} por ${p}.`,
    l_single: (n) => `${n} individual${n === 1 ? '' : 'es'}`, l_pack: (q, n) => `${n > 1 ? n + ' × ' : ''}Paquete de ${q}`, l_session: 'Sesión completa',
    subtotal: 'Subtotal', savings: 'Ahorras', total: 'Total', crc_note: (c) => `≈ ${c} por SINPE Móvil`,
    email_label: 'Correo (recibirás tu enlace)', phone_label: 'WhatsApp (opcional, para enviarte el enlace)',
    m_sinpe: 'SINPE Móvil (colones)', m_paypal: 'Tarjeta o PayPal (dólares)', m_demo: 'Pago simulado (pruebas)',
    pay_sinpe: 'Continuar con SINPE Móvil', pay_demo: 'Pagar (simulado)', pay_paypal: 'Paga con los botones de arriba',
    creating: 'Preparando…', pay_err: 'No se pudo completar el pago. Intenta de nuevo.', no_pay: 'Los pagos aún no están disponibles.',
    bad_email: 'Escribe un correo válido.', help: 'Escríbenos por WhatsApp si no encuentras tu foto',
  },
  en: {
    hero_sub: 'Find your wave. Download your original full-quality photo or video, no watermark.',
    hero_cta: 'Browse gallery', cart: 'Cart', cart_title: 'Your cart', cart_empty: "Nothing here yet. Tap the + on your photos.",
    f_session: 'Session', f_spot: 'Beach / spot', f_date: 'Date', all_sessions_opt: 'All sessions', all_spots: 'All beaches', all_dates: 'All dates',
    k_all: 'All', k_photo: 'Photos', k_video: 'Videos', all_sessions: 'See all sessions',
    hint: 'Previews are watermarked. After payment you download the original, unwatermarked, in full resolution.',
    empty: 'Nothing here yet for this filter.', photo: 'Photo', video: 'Video', untitled: 'Surf',
    b1: 'Original file, no watermark', b2: 'Instant download once payment is confirmed', b3: (d, n) => `Link valid ${d} days · up to ${n} downloads per file`,
    add: 'Add to cart', added: '✓ In cart (remove)', go_cart: 'View cart',
    session_all: (n, p) => (p ? `Whole session (${n}) · ${p}` : `Add whole session (${n})`), share_wa: 'Share on WhatsApp', copy_link: 'Copy link', copied: 'Copied!',
    session_files: (n) => `${n} file${n === 1 ? '' : 's'}`,
    pack: (q, p) => `${q} for ${p}`, packs_title: 'Bundles:',
    upsell: (n, q, p) => `Add ${n} more and get ${q} for ${p}.`,
    l_single: (n) => `${n} single${n === 1 ? '' : 's'}`, l_pack: (q, n) => `${n > 1 ? n + ' × ' : ''}Bundle of ${q}`, l_session: 'Full session',
    subtotal: 'Subtotal', savings: 'You save', total: 'Total', crc_note: (c) => `≈ ${c} via SINPE Móvil`,
    email_label: 'Email (your link will be sent here)', phone_label: 'WhatsApp (optional, to also get the link there)',
    m_sinpe: 'SINPE Móvil (colones, Costa Rica)', m_paypal: 'Card or PayPal (USD)', m_demo: 'Simulated payment (testing)',
    pay_sinpe: 'Continue with SINPE Móvil', pay_demo: 'Pay (simulated)', pay_paypal: 'Pay with the buttons above',
    creating: 'Preparing…', pay_err: 'Payment could not be completed. Please try again.', no_pay: 'Payments are not available yet.',
    bad_email: 'Enter a valid email.', help: "Message us on WhatsApp if you can't find your photo",
  },
};
let lang = localStorage.getItem('lang') || ((navigator.language || 'es').startsWith('en') ? 'en' : 'es');
const t = (k, ...a) => (typeof T[lang][k] === 'function' ? T[lang][k](...a) : T[lang][k]);
const $ = (s) => document.querySelector(s);
const usd = (c) => new Intl.NumberFormat(lang === 'es' ? 'es-CR' : 'en-US', { style: 'currency', currency: cfg.currency, minimumFractionDigits: c % 100 ? 2 : 0 }).format(c / 100);
const crc = (n) => '₡' + new Intl.NumberFormat('es-CR').format(n);
const fmtDate = (d) => (d ? new Date(d + 'T12:00').toLocaleDateString(lang === 'es' ? 'es-CR' : 'en-US', { dateStyle: 'medium' }) : '');
const label = (m) => m.title || t('untitled');
const api = async (url, opts) => {
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};
const post = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

let cfg; let items = []; let current = null; let filterData = { spots: [], dates: [], sessions: [] };
let session = null; // sesión abierta vía /s/<código>
const state = { session: '', spot: '', date: '', kind: '' };
const m = location.pathname.match(/^\/s\/([a-z0-9]+)$/); if (m) state.session = m[1];

// ---------- carrito (localStorage) ----------
let cart = {}; // id -> {id,title,kind,thumb,price_cents}
try { cart = JSON.parse(localStorage.getItem('cart') || '{}'); } catch { cart = {}; }
const saveCart = () => { try { localStorage.setItem('cart', JSON.stringify(cart)); } catch { /* sin almacenamiento */ } };
let q = null; // última cotización del servidor

function toggle(mm) {
  if (cart[mm.id]) delete cart[mm.id];
  else { cart[mm.id] = { id: mm.id, title: mm.title, kind: mm.kind, thumb: mm.thumb, price_cents: mm.price_cents }; bump(); }
  saveCart(); refreshQuote(); markCards();
}
function bump() { const b = $('#cartBtn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }

async function refreshQuote() {
  const ids = Object.keys(cart);
  $('#cartN').textContent = ids.length;
  if (!ids.length) { q = null; renderCart(); return; }
  try {
    q = await post('/api/quote', { ids });
    const valid = new Set(q.ids); // el servidor descarta lo que ya no está disponible
    for (const id of ids) if (!valid.has(id)) delete cart[id];
    saveCart(); $('#cartN').textContent = Object.keys(cart).length;
  } catch { /* conserva la última cotización */ }
  renderCart();
}

function renderCart() {
  const ids = Object.keys(cart);
  $('#cartEmpty').hidden = ids.length > 0; $('#cartBody').hidden = !ids.length;
  $('#cartItems').replaceChildren(...ids.map((id) => {
    const c = cart[id]; const row = document.createElement('div'); row.className = 'ci';
    const img = new Image(); img.src = c.thumb; img.alt = '';
    const nm = document.createElement('span'); nm.textContent = `${c.kind === 'video' ? '▶ ' : ''}${label(c)}`;
    const pr = document.createElement('span'); pr.textContent = usd(c.price_cents);
    const rm = document.createElement('button'); rm.type = 'button'; rm.textContent = '✕'; rm.setAttribute('aria-label', 'remove');
    rm.addEventListener('click', () => { delete cart[id]; saveCart(); refreshQuote(); markCards(); });
    row.append(img, nm, pr, rm); return row;
  }));
  if (!q || !ids.length) return;
  const rows = [];
  const line = (a, b, cls = '') => { const r = document.createElement('div'); r.className = 'row2 ' + cls; const x = document.createElement('span'); x.textContent = a; const y = document.createElement('span'); y.textContent = b; r.append(x, y); rows.push(r); };
  for (const l of q.lines) {
    if (l.type === 'session') line(t('l_session'), usd(l.price_cents));
    else if (l.type === 'pack') line(t('l_pack', l.qty, l.times), usd(l.price_cents * l.times));
    else line(t('l_single', l.qty), '');
  }
  if (q.savings_cents > 0) { line(t('subtotal'), usd(q.subtotal_cents)); line(t('savings'), '−' + usd(q.savings_cents), 'save'); }
  line(t('total'), usd(q.total_cents), 'big');
  if (cfg.sinpe) { const n = document.createElement('div'); n.className = 'note'; n.textContent = t('crc_note', crc(q.total_crc)); rows.push(n); }
  $('#totals').replaceChildren(...rows);

  const next = [...cfg.packs].sort((a, b) => a.qty - b.qty).find((p) => p.qty > q.count);
  const up = $('#upsell');
  up.hidden = !(next && next.qty - q.count <= 2);
  if (!up.hidden) up.textContent = t('upsell', next.qty - q.count, next.qty, usd(next.price_cents));
  renderMethods();
}

// ---------- métodos de pago ----------
let method = '';
function availableMethods() {
  const list = [];
  if (cfg.sinpe) list.push('sinpe');
  if (cfg.paypalClientId) list.push('paypal'); else if (cfg.demoPayments) list.push('demo');
  return list;
}
function renderMethods() {
  const list = availableMethods();
  if (!list.includes(method)) method = (lang === 'es' ? list[0] : list.find((x) => x !== 'sinpe') || list[0]) || '';
  const box = $('#methods'); box.replaceChildren();
  for (const mm of list) {
    const lab = document.createElement('label'); lab.className = 'method';
    const r = document.createElement('input'); r.type = 'radio'; r.name = 'method'; r.value = mm; r.checked = mm === method;
    r.addEventListener('change', () => { method = mm; syncPayUi(); });
    const s = document.createElement('span'); s.textContent = t('m_' + mm);
    lab.append(r, s); box.append(lab);
  }
  syncPayUi();
}
let paypalRendered = false;
function syncPayUi() {
  const btn = $('#payBtn');
  $('#paypal-box').hidden = method !== 'paypal';
  btn.hidden = method === 'paypal' || !method;
  btn.textContent = method === 'sinpe' ? t('pay_sinpe') : t('pay_demo');
  if (!method) say(t('no_pay'), 'err');
  if (method === 'paypal') setupPayPal();
}
const say = (txt, cls = '') => { const e = $('#msg'); e.textContent = txt; e.className = 'msg ' + cls; };
const form = () => ({ ids: Object.keys(cart), email: $('#email').value.trim(), phone: $('#phone').value.trim() });
const emailOk = () => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test($('#email').value.trim());

async function setupPayPal() {
  if (paypalRendered) return;
  try {
    await new Promise((res, rej) => {
      if (window.paypal) return res();
      const s = document.createElement('script');
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.paypalClientId)}&currency=${cfg.currency}&intent=capture&components=buttons`;
      s.onload = res; s.onerror = () => rej(new Error('PayPal')); document.head.append(s);
    });
    paypalRendered = true;
    let orderId;
    window.paypal.Buttons({
      style: { layout: 'vertical', shape: 'pill', label: 'pay' },
      onClick: (_d, actions) => (emailOk() ? actions.resolve() : (say(t('bad_email'), 'err'), $('#email').focus(), actions.reject())),
      createOrder: async () => { say(t('creating')); const r = await post('/api/checkout', { ...form(), method: 'paypal' }); orderId = r.orderId; return r.paypalOrderId; },
      onApprove: async () => { const r = await post(`/api/checkout/${orderId}/capture`); finish(r.next); },
      onError: () => say(t('pay_err'), 'err'), onCancel: () => say(''),
    }).render('#paypal-box');
  } catch { say(t('pay_err'), 'err'); }
}
function finish(next) { cart = {}; saveCart(); location.href = next; }

$('#payForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!emailOk()) { say(t('bad_email'), 'err'); $('#email').focus(); return; }
  $('#payBtn').disabled = true; say(t('creating'));
  try {
    const r = await post('/api/checkout', { ...form(), method });
    if (r.method === 'demo') { const p = await post(`/api/checkout/${r.orderId}/demo-pay`); return finish(p.next); }
    finish(`/o/${r.orderId}`); // SINPE: la página del pedido muestra las instrucciones
  } catch (err) { say(err.message, 'err'); $('#payBtn').disabled = false; }
});

// ---------- galería ----------
function renderFilters() {
  const fill = (sel, first, opts, val) => { sel.replaceChildren(new Option(first, ''), ...opts); sel.value = val; };
  fill($('#fSession'), t('all_sessions_opt'), filterData.sessions.map((s) => new Option(`${s.name}${s.shot_date ? ' · ' + fmtDate(s.shot_date) : ''}`, s.code)), state.session);
  fill($('#fSpot'), t('all_spots'), filterData.spots.map((s) => new Option(s, s)), state.spot);
  fill($('#fDate'), t('all_dates'), filterData.dates.map((d) => new Option(fmtDate(d), d)), state.date);
}

function renderPacks() {
  const p = $('#packs');
  p.replaceChildren(...(cfg.packs.length ? [t('packs_title'), ...cfg.packs.map((k) => k)] : []).map((k) => {
    const s = document.createElement('span');
    s.textContent = typeof k === 'string' ? k : t('pack', k.qty, usd(k.price_cents)); if (typeof k === 'string') s.style.background = 'none'; return s;
  }));
}

function renderBanner() {
  const b = $('#banner'); b.hidden = !session;
  if (!session) return;
  $('#bName').textContent = session.name;
  $('#bSub').textContent = [session.spot, fmtDate(session.shot_date), t('session_files', session.count)].filter(Boolean).join(' · ');
  $('#bAll').textContent = t('session_all', session.count, session.all_price_cents ? usd(session.all_price_cents) : '');
  $('#bWa').href = `https://wa.me/?text=${encodeURIComponent(`${session.name} – ${cfg.brand}\n${session.url}`)}`;
}

function markCards() {
  document.querySelectorAll('.card .add').forEach((b) => { const on = Boolean(cart[b.dataset.id]); b.setAttribute('aria-pressed', on); b.textContent = on ? '✓' : '+'; });
  if (current) syncModal();
}

function render() {
  const grid = $('#grid');
  if (!items.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = t('empty'); grid.replaceChildren(p); return; }
  grid.replaceChildren(...items.map((mm) => {
    const card = document.createElement('div'); card.className = 'card';
    const open = document.createElement('button'); open.className = 'open'; open.type = 'button';
    const ph = document.createElement('div'); ph.className = 'ph';
    const img = new Image(); img.src = mm.thumb; img.alt = label(mm); img.loading = 'lazy'; ph.append(img);
    const meta = document.createElement('div'); meta.className = 'meta';
    const left = document.createElement('div');
    const s = document.createElement('strong'); s.textContent = label(mm);
    const sm = document.createElement('small'); sm.textContent = [mm.spot, fmtDate(mm.shot_date)].filter(Boolean).join(' · ');
    left.append(s, sm);
    const price = document.createElement('span'); price.className = 'price'; price.textContent = usd(mm.price_cents);
    meta.append(left, price); open.append(ph, meta);
    open.addEventListener('click', () => openItem(mm));
    const add = document.createElement('button'); add.className = 'add'; add.type = 'button'; add.textContent = cart[mm.id] ? '✓' : '+'; add.dataset.id = mm.id;
    add.setAttribute('aria-label', t('add')); add.setAttribute('aria-pressed', Boolean(cart[mm.id]));
    add.addEventListener('click', () => toggle(mm));
    card.append(open, add);
    if (mm.kind === 'video') { const bd = document.createElement('span'); bd.className = 'badge'; bd.textContent = '▶ ' + t('video'); card.append(bd); }
    return card;
  }));
}

async function load() {
  const qs = new URLSearchParams(Object.entries(state).filter(([, v]) => v));
  items = await api('/api/media?' + qs);
  render();
}

// ---------- modal de vista previa ----------
const dlg = $('#dlg');
function syncModal() {
  $('#mAdd').textContent = cart[current.id] ? t('added') : `${t('add')} · ${usd(current.price_cents)}`;
  $('#mAdd').classList.toggle('ghost', Boolean(cart[current.id]));
  $('#mAdd').classList.toggle('sun', !cart[current.id]);
}
function openItem(mm) {
  current = mm;
  const stage = $('#stage'); stage.replaceChildren();
  if (mm.kind === 'video') {
    const v = document.createElement('video');
    v.src = mm.preview; v.poster = mm.thumb; v.controls = true; v.playsInline = true; v.preload = 'metadata';
    v.setAttribute('controlslist', 'nodownload'); v.addEventListener('contextmenu', (e) => e.preventDefault());
    stage.append(v);
  } else {
    const i = new Image(); i.src = mm.preview; i.alt = label(mm); i.draggable = false; i.addEventListener('contextmenu', (e) => e.preventDefault()); stage.append(i);
  }
  $('#mTitle').textContent = label(mm);
  $('#mSub').textContent = [mm.kind === 'video' ? t('video') : t('photo'), mm.spot, fmtDate(mm.shot_date)].filter(Boolean).join(' · ');
  $('#b3').textContent = t('b3', cfg.downloadDays, cfg.maxDownloads);
  syncModal();
  if (!dlg.open) dlg.showModal();
}
$('#mAdd').addEventListener('click', () => toggle(current));
$('#mCart').addEventListener('click', () => { dlg.close(); openCart(); });
$('#dlgClose').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener('close', () => { $('#stage').replaceChildren(); current = null; });

const cartDlg = $('#cartDlg');
function openCart() { renderCart(); refreshQuote(); if (!cartDlg.open) cartDlg.showModal(); }
$('#cartBtn').addEventListener('click', openCart);
$('#cartClose').addEventListener('click', () => cartDlg.close());
cartDlg.addEventListener('click', (e) => { if (e.target === cartDlg) cartDlg.close(); });

// ---------- sesión: agregar todo / compartir ----------
$('#bAll').addEventListener('click', async () => {
  const all = await api('/api/media?session=' + session.code);
  for (const mm of all) cart[mm.id] = { id: mm.id, title: mm.title, kind: mm.kind, thumb: mm.thumb, price_cents: mm.price_cents };
  saveCart(); bump(); markCards(); await refreshQuote(); openCart();
});
$('#bCopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(session.url); $('#bCopy').textContent = t('copied'); setTimeout(() => { $('#bCopy').textContent = t('copy_link'); }, 1500); } catch { prompt('', session.url); }
});

// ---------- filtros e idioma ----------
$('#fSession').addEventListener('change', (e) => { location.href = e.target.value ? `/s/${e.target.value}` : '/'; });
$('#fSpot').addEventListener('change', (e) => { state.spot = e.target.value; load(); });
$('#fDate').addEventListener('change', (e) => { state.date = e.target.value; load(); });
document.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => {
  state.kind = b.dataset.kind;
  document.querySelectorAll('[data-kind]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  load();
}));

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

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.lang === lang));
  if (!cfg) return;
  $('#h1').textContent = cfg.brand;
  renderFilters(); renderPacks(); renderBanner(); render(); renderFooter(); renderCart();
}
document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
  lang = b.dataset.lang; localStorage.setItem('lang', lang); method = ''; applyLang();
}));

(async () => {
  cfg = await api('/api/config');
  document.title = `${cfg.brand} – ${cfg.tagline}`;
  $('#logo').textContent = cfg.brand;
  filterData = await api('/api/filters');
  if (state.session) { try { session = await api('/api/sessions/' + state.session); document.title = `${session.name} – ${cfg.brand}`; } catch { location.replace('/'); return; } }
  applyLang();
  await Promise.all([load(), refreshQuote()]);
})();
