/* ═══════════════════════════════════════════════════════════
   charts.js — pure SVG chart helpers (no libraries)
   ═══════════════════════════════════════════════════════════ */

function polar(cx, cy, r, deg) {
  const a = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arcPath(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  const large = (a1 - a0) % 360 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}
function lerpColor(c1, c2, t) {
  const h = x => [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)];
  const [a, b, c] = h(c1), [d, e, f] = h(c2);
  const m = (p, q) => Math.round(p + (q - p) * t);
  return `rgb(${m(a, d)},${m(b, e)},${m(c, f)})`;
}

/* score gauge: 270° sweep, red→amber→green */
function renderGauge(el, val, max, subLabel) {
  const S = 206, cx = S / 2, cy = S / 2, r = 78, sw = 16, START = 135, SWEEP = 270;
  const frac = Math.max(0, Math.min(1, val / max)), steps = 90;
  let seg = '';
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const a0 = START + SWEEP * t0, a1 = START + SWEEP * t1 + .6;
    const col = t1 <= frac
      ? (t0 < .5 ? lerpColor('#e05a3c', '#f2c94c', t0 / .5) : lerpColor('#f2c94c', '#37b98a', (t0 - .5) / .5))
      : '#e4e7eb';
    seg += `<path d="${arcPath(cx, cy, r, a0, a1)}" stroke="${col}" stroke-width="${sw}" fill="none"/>`;
  }
  el.innerHTML = `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${seg}
    <text x="${cx}" y="${cy + 6}" text-anchor="middle" class="gauge-num">${val.toFixed(1)}</text>
    <text x="${cx}" y="${cy + 28}" text-anchor="middle" class="gauge-sub">${subLabel}</text></svg>`;
}

/* donut with side legend */
function renderDonut(el, segs) {
  const tot = segs.reduce((s, x) => s + x.value, 0);
  if (!tot) { el.innerHTML = `<div class="muted" style="font-size:12px">No data</div>`; return; }
  const S = 164, cx = S / 2, cy = S / 2, r = 56, sw = 25, C = 2 * Math.PI * r;
  let off = 0, rings = '';
  segs.forEach(s => {
    const len = C * (s.value / tot);
    rings += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${sw}"
      stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"/>`;
    off += len;
  });
  const leg = segs.map(s =>
    `<div class="lg"><span class="dot" style="background:${s.color}"></span>${s.label}<span class="muted" style="margin-left:auto">${s.value}</span></div>`).join('');
  el.innerHTML = `<div class="donut-wrap"><svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${rings}</svg><div class="legend">${leg}</div></div>`;
}

/* horizontal bars */
function renderHBars(el, rows, color, cap) {
  if (!rows.length || rows.every(r => !r.value)) { el.innerHTML = `<div class="muted" style="font-size:12px;padding:12px">No data</div>`; return; }
  const max = Math.max(...rows.map(r => r.value), 1), nice = Math.max(2, Math.ceil(max / 4) * 4);
  el.innerHTML = `<div class="hbars">` + rows.map(r =>
    `<div class="hbar-row"><div class="hbar-label" title="${r.label}">${r.label}</div>
     <div class="hbar-track"><div class="hbar-fill" style="width:${(r.value / nice * 100).toFixed(1)}%;background:${r.color || color}"></div></div>
     <div class="hbar-val">${r.value}</div></div>`).join('') +
    `<div class="hbar-cap">${cap}</div></div>`;
}
