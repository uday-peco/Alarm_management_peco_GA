/* ═══════════════════════════════════════════════════════════
   dataLoader.js — CSV ingestion + normalization
   ───────────────────────────────────────────────────────────
   Sources (relative to index.html):
     Data/fci_export.csv
     Data/intelliruptors_export.csv
     Data/recloser_export.csv
   Loaded at runtime via fetch (requires Live Server / any
   local HTTP server). If fetch fails (file:// double-click),
   a drag-and-drop loader overlay is shown instead.
   ═══════════════════════════════════════════════════════════ */

const SOURCES = [
  { key: 'FCI',           label: 'FCI',            file: 'Data/fci_export.csv',            color: '#2a7fd4' },
  { key: 'IntelliRupter', label: 'IntelliRupters', file: 'Data/intelliruptors_export.csv', color: '#22c3d6' },
  { key: 'Recloser',      label: 'Reclosers',      file: 'Data/recloser_export.csv',       color: '#b39ddb' },
];

/* ═══════════════════════════════════════════════════════════
   CFCI Smart Controller telemetry export

   Expected file:
   Data/cfci_telemetry.csv

   The telemetry file uses this header:
   "Device ID - Session"

   Example:
   30312-1 -> match key 30312
   30574-1 -> match key 30574
   ═══════════════════════════════════════════════════════════ */

const CFCI_TELEMETRY_FILE = "Data/cfci_telemetry.csv";

/*
  Removes the session suffix from a controller/device ID.

  Examples:
  "30312-1" -> "30312"
  "30312-2" -> "30312"
  "30312"   -> "30312"

  This is used for both the telemetry CSV ID and the fleet-device ID,
  so device records can be matched consistently.
*/
function baseDeviceId(value) {
  /*
    Examples:
    "30312-1"              -> "30312"
    "30312 - 1"            -> "30312"
    " 30312-1 "            -> "30312"
    "30312"                -> "30312"
    "30312-1.0"            -> "30312"
  */
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\s*-\s*/)[0]
    .trim()
    .replace(/\.0$/, "")
    .toUpperCase();
}

/* ── RFC-4180-ish CSV parser (handles quoted fields, CRLF) ── */
function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i+1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}

function rowsToObjects(rows) {
  if (!rows.length) return [];

  /*
    Removes leading/trailing spaces and removes a hidden UTF-8 BOM
    character that Excel exports sometimes add to the first header.
  */
  const hdr = rows[0].map(h =>
    String(h ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
  );

  return rows.slice(1).map(r => {
    const o = {};

    hdr.forEach((h, i) => {
      o[h] = String(r[i] ?? "").trim();
    });

    return o;
  });
}

/* ── normalization ── */
function cleanLoc(loc)   { return loc.replace(/^\s*(removed|remove)\s*[-:]\s*/i, '').trim(); }
function substation(loc) { const s = cleanLoc(loc); return s ? (s.split(/[-\s]/)[0] || 'Unknown') : 'Unknown'; }

function normalizeRecord(raw, category) {
  const lat = parseFloat(raw['Latitude']),  lng = parseFloat(raw['Longitude']);
  const ssi = parseFloat(raw['SSI']);
  const inService = String(raw['In Service']).toUpperCase() === 'TRUE';
  const loc = raw['Location'] || '';
  const removedTag = /remov/i.test(loc);
  return {
    id: raw['Device ID'],
    category,
    inService,
    location: loc,
    cleanLocation: cleanLoc(loc) || '—',
    substation: substation(loc),
    product: raw['Product'] || '—',
    provider: raw['Provider'] || '—',
    encryption: raw['Encryption'] || '—',
    firmware: raw['Firmware Version'] || '—',
    commStatus: raw['Comm Status'] || 'Unknown',
    lifecycle: inService ? 'Active' : (removedTag ? 'Removed' : 'Inactive'),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    ssi: Number.isFinite(ssi) ? ssi : null,
    radioModel: raw['Radio Model'] || '—',
    radioIds: raw['Radio Identifiers'] ? [raw['Radio Identifiers']] : [],
  };
}

/* Dedup on (category, Device ID). Cellular exports repeat the same
   radio as one IMEI row + one ICCID row — merge identifiers, count once. */
function dedupe(records) {
  const map = new Map();
  for (const r of records) {
    const k = r.category + '|' + r.id;
    if (map.has(k)) {
      const prev = map.get(k);
      for (const rid of r.radioIds) if (!prev.radioIds.includes(rid)) prev.radioIds.push(rid);
      if (prev.lat == null && r.lat != null) { prev.lat = r.lat; prev.lng = r.lng; }
    } else map.set(k, { ...r, radioIds: [...r.radioIds] });
  }
  return [...map.values()];
}

/* ── loading ── */
const Fleet = {
  devices: [],
  sourceStatus: {},
  mode: "fetch",

  /*
    Stores full CFCI telemetry CSV rows indexed by base device ID.

    Example:
    Fleet.cfciTelemetryByDeviceId["30312"]
  */
  cfciTelemetryByDeviceId: {},

  cfciTelemetryStatus: {
    loaded: false,
    rows: 0,
    matchedDevices: 0,
    error: null
  }
};
/* ═══════════════════════════════════════════════════════════
   Load optional CFCI Smart Controller telemetry CSV
   ═══════════════════════════════════════════════════════════ */

async function loadCfciTelemetry() {
  try {
    const response = await fetch(CFCI_TELEMETRY_FILE, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    const rows = rowsToObjects(parseCSV(text));

    if (!rows.length) {
      throw new Error("The CFCI telemetry CSV has no data rows.");
    }

    /*
      Find the device/session ID header safely.

      This allows for:
      - Device ID - Session
      - hidden BOM character before the first header
      - minor capitalization/spacing changes
    */
    const headers = Object.keys(rows[0]);

    const deviceIdHeader = headers.find(header =>
      header
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase() === "device id - session"
    );

    if (!deviceIdHeader) {
      console.error("CFCI telemetry headers found:", headers);

      throw new Error(
        'Could not find required telemetry column "Device ID - Session". ' +
        "Check the CSV header exactly."
      );
    }

    const indexed = {};
    let skippedRows = 0;

    rows.forEach(row => {
      const sessionId = row[deviceIdHeader];
      const key = baseDeviceId(sessionId);

      if (!key) {
        skippedRows++;
        return;
      }

      indexed[key] = {
        ...row,
        __sessionId: sessionId,
        __baseDeviceId: key
      };
    });

    Fleet.cfciTelemetryByDeviceId = indexed;

    Fleet.cfciTelemetryStatus = {
      loaded: true,
      rows: Object.keys(indexed).length,
      matchedDevices: 0,
      error: null
    };

    console.log(
      `Loaded ${Object.keys(indexed).length} CFCI telemetry records.`
    );

    console.log(
      "Example CFCI telemetry keys:",
      Object.keys(indexed).slice(0, 10)
    );

    console.log(
      "Example telemetry record:",
      indexed[Object.keys(indexed)[0]]
    );

    if (skippedRows) {
      console.warn(
        `Skipped ${skippedRows} CFCI telemetry row(s) because they had no Device ID - Session value.`
      );
    }

    return true;
  } catch (error) {
    Fleet.cfciTelemetryByDeviceId = {};

    Fleet.cfciTelemetryStatus = {
      loaded: false,
      rows: 0,
      matchedDevices: 0,
      error: String(error)
    };

    console.error(
      `CFCI telemetry was not loaded from ${CFCI_TELEMETRY_FILE}:`,
      error
    );

    return false;
  }
}

async function loadAllCSVs() {
  let anyLoaded = false, fetchWorked = false;
  for (const src of SOURCES) {
    try {
      const res = await fetch(src.file, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      fetchWorked = true;
      const objs = rowsToObjects(parseCSV(text));
      const recs = dedupe(objs.filter(o => o['Device ID']).map(o => normalizeRecord(o, src.key)));
      Fleet.devices.push(...recs);
      Fleet.sourceStatus[src.key] = { loaded: true, rows: objs.length, devices: recs.length };
      if (recs.length) anyLoaded = true;
    } catch (e) {
      Fleet.sourceStatus[src.key] = { loaded: false, error: String(e) };
    }
  }
  if (!fetchWorked) {
    Fleet.mode = 'manual';
    document.getElementById('sb-load-data').style.display = 'flex';
    document.querySelector('.dot-live').classList.add('err');
    showLoaderOverlay();
    return false;
  }

  /*
    This is optional. The dashboard will still load if the CFCI telemetry
    file is absent, but CFCI telemetry details will not appear.
  */
  await loadCfciTelemetry();

  /*
    Count how many current fleet devices have a matching telemetry record.
  */
  Fleet.cfciTelemetryStatus.matchedDevices = Fleet.devices.filter(device => {
    const deviceKey = baseDeviceId(device.id);
    return Boolean(Fleet.cfciTelemetryByDeviceId[deviceKey]);
  }).length;

  return anyLoaded;
}

/* ── drag-and-drop fallback (file:// mode) ── */
/* ── drag-and-drop fallback (file:// mode) ── */
let loaderBound = false;

function showLoaderOverlay() {
  document.getElementById('loader-overlay').classList.add('show');
  updateLoaderStatus();
  if (loaderBound) return;
  loaderBound = true;
  const zone = document.getElementById('drop-zone');
  const input = document.getElementById('file-input');
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag'); ingestFiles(e.dataTransfer.files); });
  input.addEventListener('change', () => { ingestFiles(input.files); input.value = ''; });
}

function dismissLoader() {
  document.getElementById('loader-overlay').classList.remove('show');
}

function ingestFiles(fileList) {
  for (const f of fileList) {
    const src = SOURCES.find(s => f.name.toLowerCase() === s.file.split('/').pop().toLowerCase());
    if (!src) continue;
    const reader = new FileReader();
    reader.onload = () => {
      Fleet.devices = Fleet.devices.filter(d => d.category !== src.key);
      const objs = rowsToObjects(parseCSV(reader.result));
      const recs = dedupe(objs.filter(o => o['Device ID']).map(o => normalizeRecord(o, src.key)));
      Fleet.devices.push(...recs);
      Fleet.sourceStatus[src.key] = { loaded: true, rows: objs.length, devices: recs.length };
      updateLoaderStatus();
      if (Object.values(Fleet.sourceStatus).some(s => s.loaded && s.devices > 0)) {
        document.getElementById('loader-continue').style.display = 'inline-block';
      }
    };
    reader.readAsText(f);
  }
}

function updateLoaderStatus() {
  document.getElementById('loader-status').innerHTML = SOURCES.map(s => {
    const st = Fleet.sourceStatus[s.key];
    return st && st.loaded
      ? `<div class="ok">✓ ${s.file.split('/').pop()} — ${st.devices} devices</div>`
      : `<div class="miss">○ ${s.file.split('/').pop()} — not loaded</div>`;
  }).join('');
}

function finishManualLoad() {
  dismissLoader();
  App.init();                                    // re-renders Home, Devices, badges
  if (typeof map !== 'undefined' && map) renderMap();  // refresh map if already open
}
