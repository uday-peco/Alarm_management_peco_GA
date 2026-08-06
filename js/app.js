/* ═══════════════════════════════════════════════════════════
   app.js — pages & rendering
   Home | Devices (category-wide search) | Map
   ═══════════════════════════════════════════════════════════ */

const countBy = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const catMeta = k => SOURCES.find(s => s.key === k);
const tagCls  = { 'Normal': 'normal', 'Missing': 'missing', 'Not in Service': 'nis' };
const lifeCls = { 'Active': 'active', 'Removed': 'removed', 'Inactive': 'inactive' };

/* Health score per device group = % of IN-SERVICE devices reporting
   Comm Status "Normal", scaled 0–10. Sourced directly from the export's
   In Service + Comm Status fields — no inferred inputs. */
function healthScore(devs) {
  const ins = devs.filter(d => d.inService);
  if (!ins.length) return null;
  return Math.round(ins.filter(d => d.commStatus === 'Normal').length / ins.length * 100) / 10;
}
const scoreColor = s => s == null ? '#c3cad3' : s >= 8 ? '#37b98a' : s >= 5 ? '#efab4d' : '#e05a3c';

const App = {
  init() {
    const D = Fleet.devices;
    document.getElementById('badge-total').textContent = D.length;
    document.getElementById('badge-detail').textContent =
      SOURCES.map(s => `${s.label}: ${D.filter(d => d.category === s.key).length}`).join(' · ');
    this.renderHome();
    this.populateDeviceFilters();
    renderDevices();
    // map inits lazily on first visit
  },

  /* ══ HOME ══ */
  renderHome() {
    const D = Fleet.devices;
    const inService = D.filter(d => d.inService);
    const fleetScore = healthScore(D);
    const missing = D.filter(d => d.commStatus === 'Missing').length;
    const located = D.filter(d => d.lat != null).length;

    document.getElementById('kpi-row').innerHTML = [
      { lbl: 'Total Devices', val: D.length, sub: 'unique across all categories', c: 'var(--c-blue)', i: '▦' },
      { lbl: 'In Service', val: inService.length, sub: D.length ? Math.round(inService.length / D.length * 100) + '% of fleet' : '—', c: 'var(--c-green)', i: '✓' },
      { lbl: 'Comm Missing', val: missing, sub: 'in-service, not reporting', c: 'var(--c-amber)', i: '!' },
      { lbl: 'Geolocated', val: located, sub: 'devices with LAT/LONG', c: 'var(--c-purple)', i: '◉' },
    ].map(k => `<div class="kpi"><div class="k-lbl"><span class="k-ic" style="background:${k.c}">${k.i}</span>${k.lbl}</div>
      <div class="k-val">${k.val}</div><div class="k-sub">${k.sub}</div></div>`).join('');

    /* per-category summary cards */
    document.getElementById('cat-row').innerHTML = SOURCES.map(src => {
      const devs = D.filter(d => d.category === src.key);
      const st = Fleet.sourceStatus[src.key];
      if (!devs.length) {
        return `<div class="cat-card"><div class="cat-head"><span class="cat-dot" style="background:${src.color}"></span>
          <span class="cat-name">${src.label}</span><span class="cat-total">0</span></div>
          <div class="cat-empty">${st && st.loaded ? 'Export loaded — no device rows yet. Drop data into ' + '<b>Data/' + '</b> and refresh.' : 'Export not loaded.'}</div></div>`;
      }
      const ins = devs.filter(d => d.inService).length;
      const comm = countBy(devs, d => d.commStatus);
      const life = countBy(devs, d => d.lifecycle);
      const score = healthScore(devs);
      return `<div class="cat-card">
        <div class="cat-head"><span class="cat-dot" style="background:${src.color}"></span>
          <span class="cat-name">${src.label}</span><span class="cat-total">${devs.length}</span></div>
        <div class="cat-stats">
          <span>In Service <b>${ins}</b></span><span>Normal <b>${comm['Normal'] || 0}</b></span>
          <span>Missing <b>${comm['Missing'] || 0}</b></span><span>Not in Svc <b>${comm['Not in Service'] || 0}</b></span>
          <span>Removed <b>${life['Removed'] || 0}</b></span><span>Located <b>${devs.filter(d => d.lat != null).length}</b></span>
        </div>
        <div class="cat-score-row">
          <div class="cat-score-bar"><div class="cat-score-fill" style="width:${score == null ? 0 : score * 10}%;background:${scoreColor(score)}"></div></div>
          <div class="cat-score-val" style="color:${scoreColor(score)}">${score == null ? '—' : score.toFixed(1) + '/10'}</div>
        </div>
      </div>`;
    }).join('');

    /* fleet-level charts */
    renderGauge(document.getElementById('gauge'), fleetScore ?? 0, 10,
      fleetScore == null ? 'no in-service devices' : `of 10 · in-service comm health`);

    renderDonut(document.getElementById('cat-donut'),
      SOURCES.map(s => ({ label: s.label, value: D.filter(d => d.category === s.key).length, color: s.color }))
        .filter(x => x.value > 0));

    const comm = countBy(D, d => d.commStatus);
    renderDonut(document.getElementById('comm-donut'), [
      { label: 'Normal', value: comm['Normal'] || 0, color: 'var(--c-teal)' },
      { label: 'Missing', value: comm['Missing'] || 0, color: 'var(--c-coral)' },
      { label: 'Not in Service', value: comm['Not in Service'] || 0, color: 'var(--c-grey)' },
    ]);

    const subs = countBy(D.filter(d => d.substation !== 'Unknown'), d => d.substation);
    renderHBars(document.getElementById('substation-bars'),
      Object.entries(subs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value })),
      'var(--c-blue)', 'Devices per substation');

    const life = countBy(D, d => d.lifecycle);
    renderDonut(document.getElementById('life-donut'), [
      { label: 'Active', value: life['Active'] || 0, color: 'var(--c-teal)' },
      { label: 'Removed', value: life['Removed'] || 0, color: 'var(--c-purple)' },
      { label: 'Inactive', value: life['Inactive'] || 0, color: 'var(--c-grey)' },
    ]);

    const prov = countBy(D, d => d.provider);
    renderDonut(document.getElementById('prov-donut'),
      Object.entries(prov).map(([label, value], i) =>
        ({ label, value, color: ['var(--c-blue)', 'var(--c-purple)', 'var(--c-amber)', 'var(--c-teal)'][i % 4] })));
  },

  /* ══ DEVICES filters ══ */
  populateDeviceFilters() {
    const catSel = document.getElementById('d-cat');
    catSel.innerHTML = '<option value="">All Categories</option>' +
      SOURCES.map(s => `<option value="${s.key}">${s.label}</option>`).join('');
    const provs = [...new Set(Fleet.devices.map(d => d.provider))].filter(p => p !== '—').sort();
    document.getElementById('d-prov').innerHTML = '<option value="">All</option>' +
      provs.map(p => `<option>${p}</option>`).join('');
  },
};

/* ══ DEVICES page (category-wide search incl. Product ID) ══ */
function renderDevices() {
  const q = (document.getElementById('d-search').value || '').toLowerCase();
  const cat = document.getElementById('d-cat').value;
  const c = document.getElementById('d-comm').value;
  const l = document.getElementById('d-life').value;
  const p = document.getElementById('d-prov').value;
  const rows = Fleet.devices.filter(d => {
    if (cat && d.category !== cat) return false;
    if (c && d.commStatus !== c) return false;
    if (l && d.lifecycle !== l) return false;
    if (p && d.provider !== p) return false;
    if (q && !(
      d.id.toLowerCase().includes(q) ||
      d.product.toLowerCase().includes(q) ||
      d.location.toLowerCase().includes(q) ||
      d.substation.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q)
    )) return false;
    return true;
  });
  document.getElementById('d-count').textContent = rows.length + ' of ' + Fleet.devices.length;
  document.getElementById('dev-tbody').innerHTML = rows.map(d => {
    const meta = catMeta(d.category);
    return `<tr class="clickable" data-key="${d.category}|${d.id}">
      <td class="mono">${d.id}</td>
      <td><span class="cat-chip"><span class="cd" style="background:${meta.color}"></span>${meta.label}</span></td>
      <td>${d.product}</td>
      <td>${d.substation}</td>
      <td><span class="tag ${tagCls[d.commStatus] || 'nis'}">${d.commStatus}</span></td>
      <td><span class="tag ${lifeCls[d.lifecycle]}">${d.lifecycle}</span></td>
      <td>${d.provider}</td>
      <td class="row-chevron">›</td>
    </tr>`;
  }).join('') || `<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">No devices match these filters.</td></tr>`;
}

/* ══ device detail panel ══ */
function openDetail(key) {
  const d = Fleet.devices.find(x => x.category + '|' + x.id === key);
  if (!d) return;
  const meta = catMeta(d.category);
  const val = (v, cls = '') => v == null || v === '' || v === '—'
    ? `<span class="dv none">Not provided in export</span>`
    : `<span class="dv ${cls}">${v}</span>`;
  const row = (k, v, cls) => `<div class="d-row"><span class="dk">${k}</span>${val(v, cls)}</div>`;
  const coords = d.lat != null ? `${d.lat.toFixed(6)}, ${d.lng.toFixed(6)}` : null;

  document.getElementById('detail-content').innerHTML = `
    <div class="d-eyebrow">${meta.label}</div>
    <div class="d-title">${d.id}</div>
    <div class="d-tags">
      <span class="tag ${tagCls[d.commStatus] || 'nis'}">${d.commStatus}</span>
      <span class="tag ${lifeCls[d.lifecycle]}">${d.lifecycle}</span>
    </div>

    <div class="d-section">
      <h4>Location</h4>
      ${row('Location', d.cleanLocation)}
      ${d.location !== d.cleanLocation ? row('Raw Location', d.location) : ''}
      ${row('Substation', d.substation)}
      ${row('Coordinates', coords, 'mono')}
      <button class="d-btn" style="margin-top:10px" ${coords ? '' : 'disabled'}
        onclick="${coords ? `showDeviceOnMap('${key}')` : ''}">
        ${coords ? '◉ View on Map' : 'No coordinates to map'}
      </button>
    </div>

    <div class="d-section">
      <h4>Communications</h4>
      ${row('Comm Status', d.commStatus)}
      ${row('Provider', d.provider)}
      ${row('Signal (SSI)', d.ssi, 'mono')}
      ${row('Radio Model', d.radioModel)}
      ${row('Radio Identifiers', d.radioIds.length ? d.radioIds.join('<br>') : null, 'mono')}
    </div>

    <div class="d-section">
      <h4>Device &amp; Firmware</h4>
      ${row('Product', d.product)}
      ${row('Firmware Version', d.firmware, 'mono')}
      ${row('Encryption', d.encryption)}
      ${row('In Service', d.inService ? 'TRUE' : 'FALSE')}
      ${row('Lifecycle', d.lifecycle)}
    </div>`;

  selectedKey = key;
  document.querySelectorAll('#dev-tbody tr.clickable').forEach(tr =>
    tr.classList.toggle('selected', tr.dataset.key === key));
  highlightMarker(key);
  document.getElementById('detail-panel').classList.add('open');
  /* on the map page the backdrop is skipped so markers stay clickable —
     click one marker then another and the panel just swaps content */
  const onMap = document.getElementById('page-map').classList.contains('active');
  document.getElementById('detail-backdrop').classList.toggle('show', !onMap);
}

function closeDetail() {
  selectedKey = null;
  document.getElementById('detail-panel').classList.remove('open');
  document.getElementById('detail-backdrop').classList.remove('show');
  document.querySelectorAll('#dev-tbody tr.selected').forEach(tr => tr.classList.remove('selected'));
  clearMarkerHighlight();
}

/* jump from the detail panel to the map, zoomed on this device */
function showDeviceOnMap(key) {
  const d = Fleet.devices.find(x => x.category + '|' + x.id === key);
  if (!d || d.lat == null) return;
  const navItem = document.querySelector('.sb-nav .sb-item[data-page="map"]');
  showPage('map', navItem);
  setTimeout(() => {
    if (!map) return;
    map.invalidateSize();
    /* if current map filters hide this device, clear them so it's visible */
    if (!markersByKey[key]) {
      document.getElementById('m-cat').value = '';
      document.getElementById('m-comm').value = '';
      renderMap();
    }
    map.setView([d.lat, d.lng], 16);
    highlightMarker(key);
    /* panel stays open, but drop the backdrop now that we're on the map */
    document.getElementById('detail-backdrop').classList.remove('show');
  }, 120);
}

/* row clicks (delegated — survives re-renders) + Esc to close */
document.getElementById('dev-tbody').addEventListener('click', e => {
  const tr = e.target.closest('tr.clickable');
  if (tr) openDetail(tr.dataset.key);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

function resetDevices() {
  ['d-search', 'd-cat', 'd-comm', 'd-life', 'd-prov'].forEach(id => document.getElementById(id).value = '');
  renderDevices();
}

/* ══ MAP page — every device in the repository with LAT/LONG ══ */
let map, layer;
let markersByKey = {};   // "category|id" -> circleMarker
let selectedKey = null;  // device currently shown in the detail panel
const MAP_COLORS = {
  category:   Object.fromEntries(SOURCES.map(s => [s.key, s.color])),
  commStatus: { 'Normal': '#22c3d6', 'Missing': '#e79a86', 'Not in Service': '#b9c0c9' },
  lifecycle:  { 'Active': '#22c3d6', 'Removed': '#b39ddb', 'Inactive': '#b9c0c9' },
};
function initMap() {
  if (map) return;
  map = L.map('leaflet-map', { scrollWheelZoom: true }).setView([40.05, -75.35], 9);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    { attribution: '© OpenStreetMap © CARTO', maxZoom: 19 }).addTo(map);
  layer = L.layerGroup().addTo(map);
  renderMap();
}
function renderMap() {
  if (!map) return;
  layer.clearLayers();
  markersByKey = {};
  const colorBy = document.getElementById('m-color').value;
  const catF = document.getElementById('m-cat').value;
  const commF = document.getElementById('m-comm').value;
  const pts = Fleet.devices.filter(d =>
    d.lat != null && (!catF || d.category === catF) && (!commF || d.commStatus === commF));
  const pal = MAP_COLORS[colorBy];
  pts.forEach(d => {
    const key = d.category + '|' + d.id;
    const base = { radius: 6, color: '#fff', weight: 1.5, fillColor: pal[d[colorBy]] || '#888', fillOpacity: .9 };
    const m = L.circleMarker([d.lat, d.lng], base)
      .bindTooltip(`<b>${d.id}</b> · ${catMeta(d.category).label}<br>${d.cleanLocation}`,
        { direction: 'top', offset: [0, -9], className: 'map-tip' })
      .on('click', () => openDetail(key))
      .addTo(layer);
    m._baseStyle = base;
    markersByKey[key] = m;
  });
  if (pts.length) { try { map.fitBounds(L.featureGroup(layer.getLayers()).getBounds().pad(.15)); } catch (e) {} }
  if (selectedKey) highlightMarker(selectedKey);   // survive filter/color changes
  const labelFor = k => colorBy === 'category' ? (catMeta(k) ? catMeta(k).label : k) : k;
  document.getElementById('map-legend').innerHTML = '<div class="legend">' +
    Object.keys(pal).map(k =>
      `<div class="lg"><span class="dot" style="background:${pal[k]}"></span>${labelFor(k)}<span class="muted" style="margin-left:auto">${pts.filter(d => d[colorBy] === k).length}</span></div>`).join('') + '</div>';
  const unlocated = Fleet.devices.length - Fleet.devices.filter(d => d.lat != null).length;
  document.getElementById('map-stats').innerHTML =
    `${pts.length} plotted` + (unlocated ? `<br><span class="muted">${unlocated} device(s) have no LAT/LONG in source</span>` : '');
}

/* marker selection styling */
function highlightMarker(key) {
  clearMarkerHighlight();
  const m = markersByKey[key];
  if (!m) return;
  m.setStyle({ radius: 10, weight: 3, color: '#1668c4' });
  m.bringToFront();
}
function clearMarkerHighlight() {
  Object.values(markersByKey).forEach(m => { if (m._baseStyle) m.setStyle(m._baseStyle); });
}

/* ══ nav ══ */
const CRUMB = { home: 'Fleet Overview', devices: 'Device Search', map: 'Geographic Distribution' };
function showPage(page, item) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.sb-nav .sb-item').forEach(i => i.classList.remove('active'));
  item.classList.add('active');
  document.getElementById('crumb').textContent = CRUMB[page];
  if (page === 'map') { initMap(); setTimeout(() => map && map.invalidateSize(), 60); }
}
document.querySelectorAll('.sb-nav .sb-item[data-page]').forEach(i =>
  i.addEventListener('click', () => { closeDetail(); showPage(i.dataset.page, i); }));

/* ══ boot ══ */
(async function boot() {
  const ok = await loadAllCSVs();
  if (Fleet.mode === 'fetch') {
    if (!ok) document.querySelector('.dot-live').classList.add('err');
    App.init();
  } else {
    /* manual mode: render the empty shell behind the loader so dismissing it
       shows a real page (zeroed KPIs + "Export not loaded" cards). Loading
       files later re-inits via the Continue button or the sidebar loader. */
    App.init();
  }
})();