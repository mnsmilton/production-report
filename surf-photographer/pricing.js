/**
 * Calcula el total del carrito con el mejor precio para el cliente.
 *  - items: [{ id, price_cents, session_code }]
 *  - packs: [{ qty, price_cents }]  ("3 por $50")
 *  - sessions: Map(code -> { all_price_cents, count })  (count = archivos disponibles de la sesión)
 * Un paquete cubre un bloque de `qty` archivos (los más caros primero); lo que no encaja se cobra por unidad.
 * El precio "toda la sesión" aplica solo si el carrito trae todos los archivos de esa sesión y resulta más barato.
 */
function bestCover(prices, packs) {
  const p = [...prices].sort((a, b) => b - a);
  const f = [0]; const how = [null];
  for (let i = 1; i <= p.length; i++) {
    f[i] = f[i - 1] + p[i - 1]; how[i] = { single: true };
    for (const k of packs) {
      if (k.qty <= i && f[i - k.qty] + k.price_cents < f[i]) { f[i] = f[i - k.qty] + k.price_cents; how[i] = { pack: k }; }
    }
  }
  const used = new Map(); let singles = 0;
  for (let i = p.length; i > 0;) {
    const h = how[i];
    if (h.pack) { used.set(h.pack.qty, (used.get(h.pack.qty) || 0) + 1); i -= h.pack.qty; } else { singles++; i--; }
  }
  return { total: f[p.length], used, singles };
}

export function quote(items, packs, sessions) {
  const subtotal = items.reduce((s, i) => s + i.price_cents, 0);
  const lines = [];
  let total = 0;
  let rest = items;

  const bySession = new Map();
  for (const it of items) if (it.session_code) bySession.set(it.session_code, [...(bySession.get(it.session_code) || []), it]);
  for (const [code, group] of bySession) {
    const s = sessions.get(code);
    if (!s?.all_price_cents || group.length !== s.count) continue;
    if (s.all_price_cents < bestCover(group.map((g) => g.price_cents), packs).total) {
      lines.push({ type: 'session', code, qty: group.length, price_cents: s.all_price_cents });
      total += s.all_price_cents;
      const ids = new Set(group.map((g) => g.id));
      rest = rest.filter((r) => !ids.has(r.id));
    }
  }

  const c = bestCover(rest.map((r) => r.price_cents), packs);
  for (const [qty, times] of c.used) lines.push({ type: 'pack', qty, times, price_cents: packs.find((k) => k.qty === qty).price_cents });
  if (c.singles) lines.push({ type: 'single', qty: c.singles });
  total += c.total;
  return { count: items.length, subtotal_cents: subtotal, total_cents: total, savings_cents: subtotal - total, lines };
}

/** Colones a cobrar por SINPE, redondeado hacia arriba a ₡100. */
export const toColones = (cents, rate) => Math.ceil((cents * rate) / 100 / 100) * 100;
