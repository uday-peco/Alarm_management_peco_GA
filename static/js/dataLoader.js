/* ═══════════════════════════════════════════════════════════
   dataLoader.js — CSV ingestion + normalization
   ═══════════════════════════════════════════════════════════ */

const SOURCES = [
  { key: "FCI", label: "FCI", file: "Data/fci_export.csv", color: "#2a7fd4" },
  { key: "IntelliRupter", label: "IntelliRupters", file: "Data/intelliruptors_export.csv", color: "#22c3d6" },
  { key: "Recloser", label: "Reclosers", file: "Data/recloser_export.csv", color: "#b39ddb" }
];

/* Detailed FCI-1 through FCI-12 telemetry */
const CFCI_TELEMETRY_FILE = "Data/cfci_telemetry.csv";

/* Controller/RTM alarms, radio, power, battery, session diagnostics */
const CFCI_CONTROLLER_STATUS_FILE = "Data/cfci_controller_status.csv";

/*
  Standard CFCI telemetry join:
  30312-1 → 30312
*/
function baseDeviceId(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\s*-\s*/)[0]
    .trim()
    .replace(/\.0$/, "")
    .toUpperCase();
}

/*
  Controller-status join:
  Use first five digits only.

  51745-0 → 51745
  51745-1 → 51745
*/
function fiveDigitDeviceId(value) {
  const match = String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .match(/^(\d{5})/);

  return match ? match[1] : "";
}

/* ── CSV parser ── */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQ = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;

      row.push(field);
      field = "";

      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }

  if (field !== "" || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }

  return rows;
}

function rowsToObjects(rows) {
  if (!rows.length) return [];

  const headers = rows[0].map(header =>
    String(header ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
  );

  return rows.slice(1).map(row => {
    const object = {};

    headers.forEach((header, index) => {
      object[header] = String(row[index] ?? "").trim();
    });

    return object;
  });
}

/* ── Fleet device normalization ── */
function cleanLoc(loc) {
  return String(loc ?? "")
    .replace(/^\s*(removed|remove)\s*[-:]\s*/i, "")
    .trim();
}

function substation(loc) {
  const clean = cleanLoc(loc);
  return clean ? (clean.split(/[-\s]/)[0] || "Unknown") : "Unknown";
}

function normalizeRecord(raw, category) {
  const lat = parseFloat(raw["Latitude"]);
  const lng = parseFloat(raw["Longitude"]);
  const ssi = parseFloat(raw["SSI"]);
  const inService = String(raw["In Service"]).toUpperCase() === "TRUE";
  const location = raw["Location"] || "";
  const removedTag = /remov/i.test(location);

  return {
    id: raw["Device ID"],
    category,
    inService,
    location,
    cleanLocation: cleanLoc(location) || "—",
    substation: substation(location),
    product: raw["Product"] || "—",
    provider: raw["Provider"] || "—",
    encryption: raw["Encryption"] || "—",
    firmware: raw["Firmware Version"] || "—",
    commStatus: raw["Comm Status"] || "Unknown",
    lifecycle: inService ? "Active" : (removedTag ? "Removed" : "Inactive"),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    ssi: Number.isFinite(ssi) ? ssi : null,
    radioModel: raw["Radio Model"] || "—",
    radioIds: raw["Radio Identifiers"] ? [raw["Radio Identifiers"]] : []
  };
}

function dedupe(records) {
  const map = new Map();

  for (const record of records) {
    const key = `${record.category}|${record.id}`;

    if (map.has(key)) {
      const previous = map.get(key);

      for (const radioId of record.radioIds) {
        if (!previous.radioIds.includes(radioId)) {
          previous.radioIds.push(radioId);
        }
      }

      if (previous.lat === null && record.lat !== null) {
        previous.lat = record.lat;
        previous.lng = record.lng;
      }
    } else {
      map.set(key, {
        ...record,
        radioIds: [...record.radioIds]
      });
    }
  }

  return [...map.values()];
}

/* ── Global application data ── */
const Fleet = {
  devices: [],
  sourceStatus: {},
  mode: "fetch",

  cfciTelemetryByDeviceId: {},
  cfciTelemetryStatus: {
    loaded: false,
    rows: 0,
    matchedDevices: 0,
    error: null
  },

  cfciControllerByDeviceId: {},
  cfciControllerStatus: {
    loaded: false,
    rows: 0,
    matchedDevices: 0,
    error: null
  }
};

/* ── Detailed FCI channel telemetry ── */
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
      throw new Error("CFCI telemetry CSV has no data rows.");
    }

    const headers = Object.keys(rows[0]);

    const deviceIdHeader = headers.find(header =>
      String(header)
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase() === "device id - session"
    );

    if (!deviceIdHeader) {
      throw new Error(
        `Could not find "Device ID - Session". Headers found: ${headers.join(" | ")}`
      );
    }

    const indexed = {};

    rows.forEach(row => {
      const sessionId = row[deviceIdHeader];
      const key = baseDeviceId(sessionId);

      if (!key) return;

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

    console.log(`Loaded ${Object.keys(indexed).length} CFCI telemetry records.`);
    return true;

  } catch (error) {
    console.warn("CFCI telemetry file was not loaded:", error);

    Fleet.cfciTelemetryByDeviceId = {};
    Fleet.cfciTelemetryStatus = {
      loaded: false,
      rows: 0,
      matchedDevices: 0,
      error: String(error)
    };

    return false;
  }
}

/* ── Controller / RTM status telemetry ── */
async function loadCfciControllerStatus() {
  try {
    const response = await fetch(CFCI_CONTROLLER_STATUS_FILE, {
      cache: "no-store"
    });

    if (response.status === 404) {
      console.warn(`Optional controller status file not found: ${CFCI_CONTROLLER_STATUS_FILE}`);

      Fleet.cfciControllerStatus = {
        loaded: false,
        rows: 0,
        matchedDevices: 0,
        error: "Controller status CSV file not found."
      };

      return false;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    const rows = rowsToObjects(parseCSV(text));

    if (!rows.length) {
      throw new Error("Controller status CSV has no data rows.");
    }

    const headers = Object.keys(rows[0]);

    const deviceIdHeader = headers.find(header =>
      String(header)
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase() === "device id - session"
    );

    if (!deviceIdHeader) {
      throw new Error(
        `Could not find "Device ID - Session". Headers found: ${headers.join(" | ")}`
      );
    }

    const indexed = {};

    rows.forEach((row, index) => {
      const sessionId = row[deviceIdHeader];
      const key = fiveDigitDeviceId(sessionId);

      if (!key) return;

      /*
        If -0 and -1 both exist, the last row in the CSV is retained.
        A future version can select the newest report timestamp instead.
      */
      indexed[key] = {
        ...row,
        __sessionId: sessionId,
        __fiveDigitDeviceId: key,
        __sourceRow: index + 1
      };
    });

    Fleet.cfciControllerByDeviceId = indexed;
    Fleet.cfciControllerStatus = {
      loaded: true,
      rows: Object.keys(indexed).length,
      matchedDevices: 0,
      error: null
    };

    console.log(`Loaded ${Object.keys(indexed).length} CFCI controller status records.`);
    return true;

  } catch (error) {
    console.error("Controller status file was not loaded:", error);

    Fleet.cfciControllerByDeviceId = {};
    Fleet.cfciControllerStatus = {
      loaded: false,
      rows: 0,
      matchedDevices: 0,
      error: String(error)
    };

    return false;
  }
}

/* ── Main loading process ── */
async function loadAllCSVs() {
  let anyLoaded = false;
  let fetchWorked = false;

  for (const source of SOURCES) {
    try {
      const response = await fetch(source.file, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      fetchWorked = true;

      const objects = rowsToObjects(parseCSV(text));

      const records = dedupe(
        objects
          .filter(row => row["Device ID"])
          .map(row => normalizeRecord(row, source.key))
      );

      Fleet.devices.push(...records);

      Fleet.sourceStatus[source.key] = {
        loaded: true,
        rows: objects.length,
        devices: records.length
      };

      if (records.length) anyLoaded = true;

    } catch (error) {
      Fleet.sourceStatus[source.key] = {
        loaded: false,
        error: String(error)
      };
    }
  }

  if (!fetchWorked) {
    Fleet.mode = "manual";
    document.getElementById("sb-load-data").style.display = "flex";
    document.querySelector(".dot-live").classList.add("err");
    showLoaderOverlay();
    return false;
  }

  await loadCfciTelemetry();
  await loadCfciControllerStatus();

  Fleet.cfciTelemetryStatus.matchedDevices = Fleet.devices.filter(device =>
    Boolean(Fleet.cfciTelemetryByDeviceId[baseDeviceId(device.id)])
  ).length;

  Fleet.cfciControllerStatus.matchedDevices = Fleet.devices.filter(device =>
    Boolean(Fleet.cfciControllerByDeviceId[fiveDigitDeviceId(device.id)])
  ).length;

  return anyLoaded;
}

/* ── Manual file loader fallback ── */
let loaderBound = false;

function showLoaderOverlay() {
  document.getElementById("loader-overlay").classList.add("show");
  updateLoaderStatus();

  if (loaderBound) return;
  loaderBound = true;

  const zone = document.getElementById("drop-zone");
  const input = document.getElementById("file-input");

  zone.addEventListener("click", () => input.click());

  zone.addEventListener("dragover", event => {
    event.preventDefault();
    zone.classList.add("drag");
  });

  zone.addEventListener("dragleave", () => {
    zone.classList.remove("drag");
  });

  zone.addEventListener("drop", event => {
    event.preventDefault();
    zone.classList.remove("drag");
    ingestFiles(event.dataTransfer.files);
  });

  input.addEventListener("change", () => {
    ingestFiles(input.files);
    input.value = "";
  });
}

function dismissLoader() {
  document.getElementById("loader-overlay").classList.remove("show");
}

function ingestFiles(fileList) {
  for (const file of fileList) {
    const source = SOURCES.find(item =>
      file.name.toLowerCase() === item.file.split("/").pop().toLowerCase()
    );

    if (!source) continue;

    const reader = new FileReader();

    reader.onload = () => {
      Fleet.devices = Fleet.devices.filter(device =>
        device.category !== source.key
      );

      const objects = rowsToObjects(parseCSV(reader.result));

      const records = dedupe(
        objects
          .filter(row => row["Device ID"])
          .map(row => normalizeRecord(row, source.key))
      );

      Fleet.devices.push(...records);

      Fleet.sourceStatus[source.key] = {
        loaded: true,
        rows: objects.length,
        devices: records.length
      };

      updateLoaderStatus();

      if (Object.values(Fleet.sourceStatus).some(status =>
        status.loaded && status.devices > 0
      )) {
        document.getElementById("loader-continue").style.display = "inline-block";
      }
    };

    reader.readAsText(file);
  }
}

function updateLoaderStatus() {
  document.getElementById("loader-status").innerHTML = SOURCES.map(source => {
    const status = Fleet.sourceStatus[source.key];

    return status && status.loaded
      ? `<div class="ok">✓ ${source.file.split("/").pop()} — ${status.devices} devices</div>`
      : `<div class="miss">○ ${source.file.split("/").pop()} — not loaded</div>`;
  }).join("");
}

function finishManualLoad() {
  dismissLoader();
  App.init();

  if (typeof map !== "undefined" && map) {
    renderMap();
  }
}