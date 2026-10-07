const $ = (s) => document.querySelector(s);
const usd = (c) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);
const api = async (url, opts = {}) => {
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.includes('login')) { show(false); throw new Error('Sesión expirada'); }
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const show = (on) => { $('#loginView').hidden = on; $('#appView').hidden = !on; };

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('/api/admin/login', json('POST', { password: $('#pw').value })); $('#pw').value = ''; start(); }
  catch (err) { $('#loginMsg').textContent = err.message; }
});
$('#logout').addEventListener('click', async (e) => { e.preventDefault(); await api('/api/admin/logout', { method: 'POST' }); show(false); });

// ---------- subida ----------
let picked = [];
const setPicked = (fl) => {
  picked = [...fl];
  $('#picked').textContent = picked.length ? `${picked.length} archivo(s) seleccionado(s)` : '';
};
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
  for (const k of ['spot', 'date', 'price', 'title']) fd.append(k === 'date' ? 'shot_date' : k, $('#' + k).value);
  picked.forEach((f) => fd.append('files', f));
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/admin/media');
  $('#upBtn').disabled = true; msg.className = 'msg';
  xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) msg.textContent = `Subiendo… ${Math.round((ev.loaded / ev.total) * 100)}%`; };
  xhr.onload = () => {
    $('#upBtn').disabled = false;
    if (xhr.status === 202) {
      msg.className = 'msg ok'; msg.textContent = 'Listo. Se están generando las marcas de agua…';
      picked = []; $('#files').value = ''; $('#picked').textContent = '';
      refresh(); pollWhileProcessing();
    } else {
      msg.className = 'msg err';
      try { msg.textContent = JSON.parse(xhr.responseText).error; } catch { msg.textContent = 'Error al subir'; }
    }
  };
  xhr.onerror = () => { $('#upBtn').disabled = false; msg.className = 'msg err'; msg.textContent = 'Error de red'; };
  xhr.send(fd);
});

// ---------- listas ----------
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };

async function refresh() {
  const [media, sales] = await Promise.all([api('/api/admin/media'), api('/api/admin/orders')]);
  $('#spots').replaceChildren(...[...new Set(media.map((m) => m.spot).filter(Boolean))].map((s) => el('option', { value: s })));

  $('#sTotal').textContent = usd(sales.total_cents); $('#sCount').textContent = sales.count;
  $('#orders').replaceChildren(...(sales.orders.length ? sales.orders.slice(0, 30).map((o) => el('div', { className: 'item' },
    el('img', { className: 'th', src: o.thumb || '', alt: '' }),
    el('div', { className: 'info' }, el('strong', {}, o.title || (o.kind === 'video' ? 'Video' : 'Foto')),
      el('small', {}, `${o.email} · ${o.spot || ''}`), el('small', {}, `${o.paid_at} UTC · ${o.downloads} descargas · ${o.provider}`)),
    el('strong', {}, usd(o.amount_cents)))) : [el('p', { className: 'msg' }, 'Aún no hay ventas.')]));

  $('#list').replaceChildren(...(media.length ? media.map(row) : [el('p', { className: 'msg' }, 'Sube tu primera sesión arriba.')]));
  return media;
}

function row(m) {
  const acts = el('div', { className: 'acts' });
  const btn = (txt, cls, fn) => acts.append(el('button', { className: 'btn ' + cls, type: 'button', onclick: fn }, txt));
  btn('Editar', 'ghost', async () => {
    const title = prompt('Título', m.title); if (title === null) return;
    const spot = prompt('Playa / spot', m.spot); if (spot === null) return;
    const price = prompt('Precio USD', (m.price_cents / 100).toString()); if (price === null) return;
    await api('/api/admin/media/' + m.id, json('PATCH', { title, spot, price })); refresh();
  });
  btn(m.active ? 'Ocultar' : 'Mostrar', 'ghost', async () => { await api('/api/admin/media/' + m.id, json('PATCH', { active: !m.active })); refresh(); });
  btn('Borrar', 'danger', async () => {
    if (!confirm(m.sales ? 'Ya tiene ventas: se ocultará (los clientes conservan su descarga). ¿Continuar?' : '¿Borrar definitivamente?')) return;
    await api('/api/admin/media/' + m.id, { method: 'DELETE' }); refresh();
  });
  const state = m.status === 'ready' ? (m.active ? '' : 'oculto') : m.status === 'processing' ? 'procesando…' : 'falló';
  return el('div', { className: 'item' },
    el('img', { className: 'th', src: m.thumb || '', alt: '' }),
    el('div', { className: 'info' },
      el('strong', {}, m.title || m.original_name || m.id), ' ', state ? el('span', { className: 'tag ' + m.status }, state) : '',
      el('small', {}, `${m.kind === 'video' ? 'Video' : 'Foto'} · ${m.spot || 'sin spot'} · ${m.shot_date || 'sin fecha'} · ${usd(m.price_cents)} · ${m.sales} ventas`)),
    acts);
}

let polling = false;
async function pollWhileProcessing() {
  if (polling) return; polling = true;
  try { for (;;) { await new Promise((r) => setTimeout(r, 3000)); const media = await refresh(); if (!media.some((m) => m.status === 'processing')) break; } }
  finally { polling = false; }
}

async function start() { show(true); const media = await refresh(); if (media.some((m) => m.status === 'processing')) pollWhileProcessing(); }
(async () => { const { admin } = await api('/api/admin/me'); admin ? start() : show(false); })();
