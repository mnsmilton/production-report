const $ = (s) => document.querySelector(s);
const usd = (c) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);
const crc = (n) => '₡' + new Intl.NumberFormat('es-CR').format(n);
const api = async (url, opts = {}) => {
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.includes('login')) { show(false); throw new Error('Sesión expirada'); }
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const show = (on) => { $('#loginView').hidden = on; $('#appView').hidden = !on; };
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
const btn = (txt, cls, fn) => el('button', { className: 'btn ' + cls, type: 'button', onclick: async (e) => { try { await fn(e); } catch (err) { alert(err.message); } } }, txt);
const fail = (err) => alert(err.message);

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('/api/admin/login', json('POST', { password: $('#pw').value })); $('#pw').value = ''; start(); }
  catch (err) { $('#loginMsg').textContent = err.message; }
});
$('#logout').addEventListener('click', async (e) => { e.preventDefault(); await api('/api/admin/logout', { method: 'POST' }); show(false); });

// ---------- sesiones ----------
$('#sesForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const s = await api('/api/admin/sessions', json('POST', { name: $('#sName').value, spot: $('#sSpot').value, shot_date: $('#sDate').value, all_price: $('#sAll').value }));
    e.target.reset(); await refresh(); $('#upSession').value = s.code;
  } catch (err) { fail(err); }
});

function sessionRow(s) {
  const acts = el('div', { className: 'acts' },
    btn('Copiar enlace', 'ghost', async (e) => { await navigator.clipboard.writeText(s.url); e.target.textContent = '¡Copiado!'; }),
    btn('Tarjeta QR', 'ghost', () => window.open('/card/' + s.code, '_blank')),
    btn('Editar', 'ghost', async () => {
      const name = prompt('Nombre', s.name); if (name === null) return;
      const spot = prompt('Playa / spot', s.spot); if (spot === null) return;
      const all = prompt('Precio de toda la sesión en USD (vacío = sin precio especial)', s.all_price_cents ? s.all_price_cents / 100 : ''); if (all === null) return;
      await api('/api/admin/sessions/' + s.code, json('PATCH', { name, spot, all_price: all })); refresh();
    }),
    btn('Borrar', 'danger', async () => { if (confirm('¿Borrar la sesión?')) { await api('/api/admin/sessions/' + s.code, { method: 'DELETE' }); refresh(); } }));
  return el('div', { className: 'item', style: 'grid-template-columns:1fr auto' },
    el('div', { className: 'info' }, el('strong', {}, s.name),
      el('small', {}, [s.spot, s.shot_date, `${s.count} archivos`, s.all_price_cents ? `toda la sesión ${usd(s.all_price_cents)}` : ''].filter(Boolean).join(' · ')),
      el('small', {}, s.url)), acts);
}

// ---------- subida ----------
let picked = [];
const setPicked = (fl) => { picked = [...fl]; $('#picked').textContent = picked.length ? `${picked.length} archivo(s) seleccionado(s)` : ''; };
$('#files').addEventListener('change', (e) => setPicked(e.target.files));
const drop = $('#drop');
['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => setPicked(e.dataTransfer.files));

$('#upForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const msg = $('#upMsg');
  if (!picked.length) { msg.className = 'msg err'; msg.textContent = 'Elige al menos un archivo.'; return; }
  const fd = new FormData();
  fd.append('session', $('#upSession').value); fd.append('price', $('#price').value); fd.append('title', $('#title').value);
  picked.forEach((f) => fd.append('files', f));
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/admin/media');
  $('#upBtn').disabled = true; msg.className = 'msg';
  xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) msg.textContent = `Subiendo… ${Math.round((ev.loaded / ev.total) * 100)}%`; };
  xhr.onload = () => {
    $('#upBtn').disabled = false;
    if (xhr.status === 202) {
      msg.className = 'msg ok'; msg.textContent = 'Listo. Se están generando las marcas de agua…';
      picked = []; $('#files').value = ''; $('#picked').textContent = ''; refresh(); pollWhileProcessing();
    } else { msg.className = 'msg err'; try { msg.textContent = JSON.parse(xhr.responseText).error; } catch { msg.textContent = 'Error al subir'; } }
  };
  xhr.onerror = () => { $('#upBtn').disabled = false; msg.className = 'msg err'; msg.textContent = 'Error de red'; };
  xhr.send(fd);
});

// ---------- precios ----------
function packRow(p = { qty: 3, price_cents: 5000 }) {
  const row = el('div', { className: 'row', style: 'grid-template-columns:1fr 1fr auto;align-items:end;margin:0' },
    el('label', { className: 'field' }, 'Cantidad de archivos', el('input', { type: 'number', min: 2, value: p.qty, className: 'pq' })),
    el('label', { className: 'field' }, 'Precio del paquete (USD)', el('input', { type: 'number', min: 1, step: 0.5, value: p.price_cents / 100, className: 'pp' })),
    btn('Quitar', 'ghost small', () => row.remove()));
  return row;
}
$('#addPack').addEventListener('click', () => $('#packRows').append(packRow({ qty: 10, price_cents: 13000 })));
$('#setForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const packs = [...document.querySelectorAll('#packRows .row')].map((r) => ({ qty: r.querySelector('.pq').value, price: r.querySelector('.pp').value }));
  try {
    await api('/api/admin/settings', { ...json('PUT', { packs, sinpeRate: $('#rate').value }) });
    $('#setMsg').className = 'msg ok'; $('#setMsg').textContent = 'Guardado.'; loadSettings();
  } catch (err) { $('#setMsg').className = 'msg err'; $('#setMsg').textContent = err.message; }
});
async function loadSettings() {
  const s = await api('/api/admin/settings');
  $('#packRows').replaceChildren(...s.packs.map(packRow)); $('#rate').value = s.sinpeRate;
}

// ---------- pedidos ----------
function orderRow(o, open) {
  const acts = el('div', { className: 'acts' });
  if (open) {
    acts.append(btn('Confirmar pago', '', async () => {
      if (!confirm(`¿Confirmas que recibiste ${crc(o.amount_crc)} con la referencia ${o.reference}?`)) return;
      const r = await api(`/api/admin/orders/${o.id}/confirm`, { method: 'POST' });
      if (r.whatsapp && confirm('Pago confirmado. ¿Enviar el enlace por WhatsApp al cliente?')) window.open(r.whatsapp, '_blank');
      refresh();
    }), btn('Cancelar', 'ghost', async () => { if (confirm('¿Cancelar este pedido?')) { await api(`/api/admin/orders/${o.id}/cancel`, { method: 'POST' }); refresh(); } }));
  } else if (o.whatsapp) acts.append(el('a', { className: 'btn ghost small', href: o.whatsapp, target: '_blank', rel: 'noopener' }, 'Enviar por WhatsApp'));
  const title = open ? `${o.reference} · ${crc(o.amount_crc)} · ${o.count} archivo(s)` : `${o.titles.join(', ') || 'Pedido'}${o.count > 3 ? '…' : ''} (${o.count})`;
  return el('div', { className: 'item' },
    el('img', { className: 'th', src: o.thumb || '', alt: '' }),
    el('div', { className: 'info' }, el('strong', {}, title, ' ', o.status === 'reported' ? el('span', { className: 'tag reported' }, 'dice que ya pagó') : ''),
      el('small', {}, `${o.email}${o.phone ? ' · +' + o.phone : ''}`),
      el('small', {}, `${o.paid_at || o.created_at} UTC · ${o.method}${o.payer_note ? ' · “' + o.payer_note + '”' : ''}`)),
    open ? acts : el('div', { className: 'acts' }, el('strong', {}, usd(o.amount_cents)), acts));
}

// ---------- listas ----------
async function refresh() {
  const [media, sales, sessions] = await Promise.all([api('/api/admin/media'), api('/api/admin/orders'), api('/api/admin/sessions')]);
  const current = $('#upSession').value;
  $('#upSession').replaceChildren(...sessions.map((s) => el('option', { value: s.code }, `${s.name}${s.shot_date ? ' · ' + s.shot_date : ''}`)));
  if (current) $('#upSession').value = current;
  $('#sessions').replaceChildren(...(sessions.length ? sessions.map(sessionRow) : [el('p', { className: 'msg' }, 'Crea tu primera sesión arriba.')]));

  $('#openPanel').hidden = !sales.open.length; $('#openN').textContent = sales.open.length;
  $('#open').replaceChildren(...sales.open.map((o) => orderRow(o, true)));
  $('#sTotal').textContent = usd(sales.total_cents); $('#sCount').textContent = sales.count;
  $('#orders').replaceChildren(...(sales.paid.length ? sales.paid.slice(0, 30).map((o) => orderRow(o, false)) : [el('p', { className: 'msg' }, 'Aún no hay ventas.')]));
  $('#list').replaceChildren(...(media.length ? media.map(row) : [el('p', { className: 'msg' }, 'Sube tu primera sesión arriba.')]));
  return media;
}

function row(m) {
  const acts = el('div', { className: 'acts' },
    btn('Editar', 'ghost', async () => {
      const title = prompt('Título', m.title); if (title === null) return;
      const price = prompt('Precio USD', (m.price_cents / 100).toString()); if (price === null) return;
      await api('/api/admin/media/' + m.id, json('PATCH', { title, price })); refresh();
    }),
    btn(m.active ? 'Ocultar' : 'Mostrar', 'ghost', async () => { await api('/api/admin/media/' + m.id, json('PATCH', { active: !m.active })); refresh(); }),
    btn('Borrar', 'danger', async () => {
      if (!confirm(m.sales ? 'Ya tiene ventas: se ocultará (los clientes conservan su descarga). ¿Continuar?' : '¿Borrar definitivamente?')) return;
      await api('/api/admin/media/' + m.id, { method: 'DELETE' }); refresh();
    }));
  const state = m.status === 'ready' ? (m.active ? '' : 'oculto') : m.status === 'processing' ? 'procesando…' : 'falló';
  return el('div', { className: 'item' },
    el('img', { className: 'th', src: m.thumb || '', alt: '' }),
    el('div', { className: 'info' },
      el('strong', {}, m.title || m.original_name || m.id), ' ', state ? el('span', { className: 'tag ' + m.status }, state) : '',
      el('small', {}, `${m.kind === 'video' ? 'Video' : 'Foto'} · ${m.session_name || 'sin sesión'} · ${usd(m.price_cents)} · ${m.sales} ${m.sales === 1 ? 'venta' : 'ventas'}`)),
    acts);
}

let polling = false;
async function pollWhileProcessing() {
  if (polling) return; polling = true;
  try { for (;;) { await new Promise((r) => setTimeout(r, 3000)); const media = await refresh(); if (!media.some((m) => m.status === 'processing')) break; } }
  finally { polling = false; }
}

async function start() {
  show(true); await loadSettings();
  const media = await refresh(); if (media.some((m) => m.status === 'processing')) pollWhileProcessing();
  setInterval(() => { if (!$('#appView').hidden && !document.hidden) refresh().catch(() => {}); }, 20000); // pedidos SINPE nuevos
}
(async () => { const { admin } = await api('/api/admin/me'); admin ? start() : show(false); })();
