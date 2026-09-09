/* ═══════════════════════════════════════════════════════════
   app.js — pages & rendering
   Home | Devices (category-wide search) | Map
   ═══════════════════════════════════════════════════════════ */

const countBy = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const catMeta = k => SOURCES.find(s => s.key === k);
const tagCls  = { 'Normal': 'normal', 'Missing': 'missing', 'Not in Service': 'nis' };
const lifeCls = { 'Active': 'active', 'Removed': 'removed', 'Inactive': 'inactive' };
/* ═══════════════════════════════════════════════════════════
   CFCI Smart Controller telemetry helpers
   ═══════════════════════════════════════════════════════════ */

/*
  Finds the telemetry record for the selected fleet device.

  Example:
  Fleet device ID:      30312-1
  Telemetry session ID: 30312-1
  Join key:             30312
*/
function getCfciTelemetry(device) {
  if (!device || !Fleet.cfciTelemetryByDeviceId) return null;

  const key = baseDeviceId(device.id);
  const telemetry = Fleet.cfciTelemetryByDeviceId[key] || null;

  console.log("CFCI telemetry lookup:", {
    fleetDeviceId: device.id,
    lookupKey: key,
    found: Boolean(telemetry),
    telemetrySessionId: telemetry?.__sessionId || null
  });

  return telemetry;
}

/* Determines whether a CSV field has a usable value. */
function hasTelemetryValue(value) {
  return (
    value !== undefined &&
    value !== null &&
    String(value).trim() !== "" &&
    String(value).trim() !== "—"
  );
}

/* Shows a useful fallback instead of blank values. */
function formatTelemetryValue(value, suffix = "") {
  if (!hasTelemetryValue(value)) {
    return "Not reported";
  }

  return `${value}${suffix}`;
}

/*
  Uses the readable "(time)" column where possible.

  Example:
  "FCI-1 Routine Data Timestamp (time)"
  is more useful than the raw epoch value:
  "FCI-1 Routine Data Timestamp"
*/
function telemetryTime(telemetry, fieldName) {
  return (
    telemetry[`${fieldName} (time)`] ||
    telemetry[fieldName] ||
    null
  );
}

/*
  Shows one individual FCI channel, such as FCI-1, FCI-2, or FCI-3.

  The function does not show completely empty channels.
*/
function renderCfciChannel(telemetry, channelNumber) {
  const prefix = `FCI-${channelNumber}`;

  const routineTimestamp = telemetryTime(
    telemetry,
    `${prefix} Routine Data Timestamp`
  );

  const serialAddress = telemetry[`${prefix} Serial Address`];
  const signalStrength = telemetry[`${prefix} Last Receive Signal Strength`];

  const actualCurrent = telemetry[`${prefix} Actual Current`];
  const averageCurrent = telemetry[`${prefix} Average Current (Amps)`];
  const peakCurrent = telemetry[`${prefix} Peak Current (Amps)`];
  const minimumCurrent = telemetry[`${prefix} Minimum Current (Amps)`];

  const ambientTemperature = telemetry[`${prefix} Ambient Temperature`];
  const conductorTemperature = telemetry[`${prefix} Conductor Temperature`];
  const maximumConductorTemperature =
    telemetry[`${prefix} Maximum Conductor Temperature`];

  const momentaryFaultCount =
    telemetry[`${prefix} Momentary Fault Count`];

  const permanentFaultCount =
    telemetry[`${prefix} Permanent Fault Count`];

  const retryCounter =
    telemetry[`${prefix} RF Transmission Retry Counter`];

  const lastFaultTimestamp = telemetryTime(
    telemetry,
    `${prefix} Last Fault Timestamp`
  );

  const lastFaultCurrent =
    telemetry[`${prefix} Last Fault Current (Amps)`];

  const lastFaultDuration =
    telemetry[`${prefix} Last Fault Duration (mSec)`];

  const tripLevel = telemetry[`${prefix} Trip Level`];

  const lossOfVoltage = telemetryTime(
    telemetry,
    `${prefix} Loss of Voltage Timestamp`
  );

  const lossOfCurrent = telemetryTime(
    telemetry,
    `${prefix} Loss of Current Timestamp`
  );

  /*
    Do not show an FCI panel if the telemetry export has no values
    for that channel.
  */
  const channelHasData = [
    routineTimestamp,
    serialAddress,
    signalStrength,
    actualCurrent,
    averageCurrent,
    peakCurrent,
    momentaryFaultCount,
    permanentFaultCount
  ].some(hasTelemetryValue);

  if (!channelHasData) return "";

  const row = (label, value, suffix = "", cls = "") => `
    <div class="cfci-row">
      <span class="cfci-label">${label}</span>
      <span class="cfci-value ${cls}">
        ${formatTelemetryValue(value, suffix)}
      </span>
    </div>
  `;

  return `
    <details class="cfci-channel" ${channelNumber <= 3 ? "open" : ""}>
      <summary>
        <span>${prefix}</span>
        <span class="cfci-channel-summary">
          ${hasTelemetryValue(actualCurrent)
            ? `${actualCurrent} A`
            : "Telemetry available"}
        </span>
      </summary>

      <div class="cfci-channel-body">
        <div class="cfci-group-title">Communication</div>
        ${row("Routine Data", routineTimestamp, "", "mono")}
        ${row("Signal Strength", signalStrength)}
        ${row("RF Retry Counter", retryCounter)}
        ${row("Serial Address", serialAddress, "", "mono")}

        <div class="cfci-group-title">Electrical Conditions</div>
        ${row("Actual Current", actualCurrent, " A")}
        ${row("Average Current", averageCurrent, " A")}
        ${row("Peak Current", peakCurrent, " A")}
        ${row("Minimum Current", minimumCurrent, " A")}
        ${row("Trip Level", tripLevel, " A")}

        <div class="cfci-group-title">Fault Activity</div>
        ${row("Momentary Fault Count", momentaryFaultCount)}
        ${row("Permanent Fault Count", permanentFaultCount)}
        ${row("Last Fault Time", lastFaultTimestamp, "", "mono")}
        ${row("Last Fault Current", lastFaultCurrent, " A")}
        ${row("Last Fault Duration", lastFaultDuration, " mSec")}
        ${row("Loss of Voltage", lossOfVoltage, "", "mono")}
        ${row("Loss of Current", lossOfCurrent, "", "mono")}

        <div class="cfci-group-title">Thermal Conditions</div>
        ${row("Ambient Temperature", ambientTemperature)}
        ${row("Conductor Temperature", conductorTemperature)}
        ${row("Maximum Conductor Temp.", maximumConductorTemperature)}
      </div>
    </details>
  `;
}

/*
  Creates the full CFCI telemetry section in the device detail panel.
*/
function renderCfciTelemetryDetails(device) {
  const telemetry = getCfciTelemetry(device);

  if (!telemetry) {
    return `
      <div class="d-section">
        <h4>CFCI Smart Controller Telemetry</h4>
        <div class="d-row">
          <span class="dk">Telemetry Status</span>
          <span class="dv none">
            No telemetry record was found for base device ID
            ${baseDeviceId(device.id)}.
          </span>
        </div>
      </div>
    `;
  }

  const channelHtml = Array.from(
    { length: 12 },
    (_, index) => renderCfciChannel(telemetry, index + 1)
  ).join("");

  const controllerTime =
    telemetry["Smart Controller Time (time)"] ||
    telemetry["Smart Controller Time"];

  const controllerFirmware =
    telemetry["Smart Controller FW Version"];

  const controllerFirmwareId =
    telemetry["Smart Controller FW ID"];

  const controllerSerial =
    telemetry["Smart Controller Serial Number"];

  const commLost =
    telemetry["CommLost Diagnostic"];

  const reportTime =
    telemetry["Report Time (Epoch milliseconds) (time)"] ||
    telemetry["Report Time (Epoch milliseconds)"];

  return `
    <div class="d-section cfci-telemetry-section">
      <h4>CFCI Smart Controller Telemetry</h4>

      <div class="cfci-controller-grid">
        <div class="cfci-controller-item">
          <span>Telemetry ID</span>
          <b class="mono">${telemetry.__sessionId || "—"}</b>
        </div>

        <div class="cfci-controller-item">
          <span>Controller Serial</span>
          <b class="mono">${formatTelemetryValue(controllerSerial)}</b>
        </div>

        <div class="cfci-controller-item">
          <span>Firmware Version</span>
          <b>${formatTelemetryValue(controllerFirmware)}</b>
        </div>

        <div class="cfci-controller-item">
          <span>Firmware ID</span>
          <b>${formatTelemetryValue(controllerFirmwareId)}</b>
        </div>

        <div class="cfci-controller-item">
          <span>Controller Time</span>
          <b class="mono">${formatTelemetryValue(controllerTime)}</b>
        </div>

        <div class="cfci-controller-item">
          <span>Comm Lost Diagnostic</span>
          <b>${formatTelemetryValue(commLost)}</b>
        </div>

        <div class="cfci-controller-item">
          <span>Report Time</span>
          <b class="mono">${formatTelemetryValue(reportTime)}</b>
        </div>
      </div>

      <div class="cfci-channel-list">
        ${channelHtml || `
          <div class="muted" style="padding:8px 0">
            This telemetry record contains no populated FCI channel fields.
          </div>
        `}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   CFCI CONTROLLER STATUS / ALARMS
   ═══════════════════════════════════════════════════════════ */

function getCfciControllerStatus(device) {
  if (!device || !Fleet.cfciControllerByDeviceId) return null;

  return Fleet.cfciControllerByDeviceId[
    fiveDigitDeviceId(device.id)
  ] || null;
}

function normalizeStatus(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isYes(value) {
  return [
    "yes",
    "true",
    "online",
    "normal",
    "ok",
    "healthy"
  ].includes(normalizeStatus(value));
}

function isOffline(value) {
  return [
    "offline",
    "off",
    "no",
    "false",
    "not online",
    "not connected",
    "down"
  ].includes(normalizeStatus(value));
}

function isAlarm(value) {
  const status = normalizeStatus(value);

  return [
    "alarm",
    "active",
    "fault",
    "failed",
    "fuse blown",
    "ac voltage not present",
    "outage",
    "critical"
  ].some(term => status.includes(term));
}

function isNormalPower(value) {
  return [
    "normal",
    "ok",
    "present",
    "ac voltage present",
    "healthy"
  ].includes(normalizeStatus(value));
}

function controllerField(controller, field) {
  return controller ? (controller[field] ?? null) : null;
}

function buildCfciControllerAlarms(device) {
  const controller = getCfciControllerStatus(device);

  if (!controller) return [];

  const alarms = [];

  const add = (severity, title, detail) => {
    alarms.push({ severity, title, detail });
  };

  const radioComms = controllerField(controller, "Radio Comms Up");
  const session0 = controllerField(controller, "Session 0 online");
  const session1 = controllerField(controller, "Session 1 online");
  const commLostStatus = controllerField(controller, "CommLost Status");
  const commLostDiagnostic = toNumber(controllerField(controller, "CommLost Diagnostic"));

  const acOutage = controllerField(controller, "AC Outage");
  const batteryFuse = controllerField(controller, "Battery Fuse Status");
  const timeSynchronized = controllerField(controller, "Time Synchronized");
  const configurationIssue = controllerField(controller, "User Configuration Issue");
  const criticalStack = controllerField(controller, "Thread(s) at Critical Stack Usage");
  const networkOverage = controllerField(controller, "Network Data Overage Alarm");

  const flagCount = toNumber(controllerField(controller, "Flag Count"));
  const inboundRetries = toNumber(controllerField(controller, "Inbound Retries"));

  const txSuccess0 = toNumber(
    controllerField(controller, "Today's Percent Successful TX (Session 0)")
  );

  const txSuccess1 = toNumber(
    controllerField(controller, "Today's Percent Successful TX (Session 1)")
  );

  if (
    normalizeStatus(acOutage).includes("ac voltage not present") ||
    normalizeStatus(acOutage).includes("outage")
  ) {
    add("critical", "AC Power Not Present", `AC Outage: ${acOutage}`);
  }

  if (normalizeStatus(batteryFuse).includes("fuse blown")) {
    add("critical", "Battery Fuse Blown", `Battery Fuse Status: ${batteryFuse}`);
  }

  if (isAlarm(commLostStatus)) {
    add("critical", "Communication Loss Alarm", `CommLost Status: ${commLostStatus}`);
  }

  if (!isYes(radioComms) && hasTelemetryValue(radioComms)) {
    add("critical", "Radio Communications Not Available", `Radio Comms Up: ${radioComms}`);
  }

  if (
    hasTelemetryValue(session0) &&
    hasTelemetryValue(session1) &&
    isOffline(session0) &&
    isOffline(session1)
  ) {
    add(
      "critical",
      "Both Communication Sessions Offline",
      `Session 0: ${session0}; Session 1: ${session1}`
    );
  }

  if (isAlarm(criticalStack)) {
    add(
      "critical",
      "Critical Controller Stack Usage",
      `Critical Stack Usage: ${criticalStack}`
    );
  }

  if (
    hasTelemetryValue(session0) &&
    hasTelemetryValue(session1) &&
    (isOffline(session0) || isOffline(session1)) &&
    !(isOffline(session0) && isOffline(session1))
  ) {
    add(
      "warning",
      "One Communication Session Offline",
      `Session 0: ${session0}; Session 1: ${session1}`
    );
  }

  if (commLostDiagnostic !== null && commLostDiagnostic !== 0) {
    add(
      "warning",
      "CommLost Diagnostic Active",
      `CommLost Diagnostic: ${commLostDiagnostic}`
    );
  }

  if (!isYes(timeSynchronized) && hasTelemetryValue(timeSynchronized)) {
    add(
      "warning",
      "Controller Time Not Synchronized",
      `Time Synchronized: ${timeSynchronized}`
    );
  }

  if (
    hasTelemetryValue(configurationIssue) &&
    !normalizeStatus(configurationIssue).includes("normal")
  ) {
    add(
      "warning",
      "User Configuration Issue",
      `Configuration Status: ${configurationIssue}`
    );
  }

  if (isAlarm(networkOverage)) {
    add(
      "warning",
      "Network Data Overage Alarm",
      `Network Data Overage Alarm: ${networkOverage}`
    );
  }

  if (flagCount !== null && flagCount > 0) {
    add("watch", "Controller Diagnostic Flags Present", `Flag Count: ${flagCount}`);
  }

  if (inboundRetries !== null && inboundRetries > 10) {
    add("watch", "Elevated Inbound Retries", `Inbound Retries: ${inboundRetries}`);
  }

  if (txSuccess0 !== null && txSuccess0 < 95) {
    add(
      "watch",
      "Reduced Session 0 Transmission Success",
      `Successful TX: ${txSuccess0}%`
    );
  }

  if (txSuccess1 !== null && txSuccess1 < 95) {
    add(
      "watch",
      "Reduced Session 1 Transmission Success",
      `Successful TX: ${txSuccess1}%`
    );
  }

  return alarms;
}

function renderCfciControllerStatus(device) {
  const controller = getCfciControllerStatus(device);

  if (!controller) {
    return `
      <div class="d-section cfci-controller-section">
        <h4>Controller Alarm Summary</h4>
        <div class="controller-no-data">
          No controller-status data found for device key:
          ${fiveDigitDeviceId(device.id)}.
        </div>
      </div>
    `;
  }

  const alarms = buildCfciControllerAlarms(device);

  const statusRow = (label, value) => `
    <div class="controller-status-row">
      <span>${label}</span>
      <strong>${formatTelemetryValue(value)}</strong>
    </div>
  `;

  const alarmHtml = alarms.length
    ? alarms.map(alarm => `
      <div class="controller-alarm ${alarm.severity}">
        <div class="controller-alarm-title">
          <span class="controller-alarm-severity">${alarm.severity}</span>
          <strong>${alarm.title}</strong>
        </div>
        <div class="controller-alarm-detail">${alarm.detail}</div>
      </div>
    `).join("")
    : `
      <div class="controller-normal">
        No controller alarms were identified from the current export.
      </div>
    `;

  return `
    <div class="d-section cfci-controller-section">
      <h4>Controller Alarm Summary</h4>

      <div class="controller-alarm-list">
        ${alarmHtml}
      </div>

      <details class="cfci-channel">
        <summary>
          <span>Controller Status and Diagnostics</span>
          <span class="cfci-channel-summary">
            ${alarms.length} alert${alarms.length === 1 ? "" : "s"}
          </span>
        </summary>

        <div class="cfci-channel-body">
          <div class="cfci-group-title">Communications</div>
          ${statusRow("Radio Comms Up", controller["Radio Comms Up"])}
          ${statusRow("Session 0", controller["Session 0 online"])}
          ${statusRow("Session 1", controller["Session 1 online"])}
          ${statusRow("CommLost Status", controller["CommLost Status"])}
          ${statusRow("CommLost Diagnostic", controller["CommLost Diagnostic"])}
          ${statusRow("RF Comms State", controller["RF Comms State"])}
          ${statusRow("Average Radio RX", controller["Average Radio RX Signal"])}
          ${statusRow("Average Radio TX", controller["Average Radio TX Signal"])}
          ${statusRow("Inbound Retries", controller["Inbound Retries"])}

          <div class="cfci-group-title">Power and Battery</div>
          ${statusRow("AC Outage", controller["AC Outage"])}
          ${statusRow("Battery Fuse Status", controller["Battery Fuse Status"])}
          ${statusRow("Line Voltage", controller["Line Voltage Present Value (VAC)"])}
          ${statusRow("Battery State", controller["Present Battery State"])}
          ${statusRow("Battery Test Condition", controller["Last Test Battery Condition"])}
          ${statusRow("Battery Test Voltage", controller["Battery Test Voltage (VDC)"])}

          <div class="cfci-group-title">Diagnostics</div>
          ${statusRow("Time Synchronized", controller["Time Synchronized"])}
          ${statusRow("Configuration Issue", controller["User Configuration Issue"])}
          ${statusRow("Critical Stack Usage", controller["Thread(s) at Critical Stack Usage"])}
          ${statusRow("Flag Count", controller["Flag Count"])}
          ${statusRow("Board Temperature", controller["Board Temperature (deg C)"])}
          ${statusRow("Firmware Version", controller["RTM FW Version Number"])}
          ${statusRow("Session ID", controller.__sessionId)}
        </div>
      </details>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   FCI HEALTH SCORE
   -----------------------------------------------------------
   Initial operational scoring model.

   Score = (
     Communication × 35%
     + Fault / Reliability × 30%
     + Thermal × 20%
     + Electrical / Load × 10%
     + Configuration × 5%
   )

   IMPORTANT:
   These thresholds are initial UI/dashboard defaults. Confirm
   them with Protection Engineering, Communications Engineering,
   and the CFCI vendor before using them for formal operations.
   ═══════════════════════════════════════════════════════════ */

const FCI_HEALTH_WEIGHTS = {
  communication: 0.35,
  fault: 0.30,
  thermal: 0.20,
  electrical: 0.10,
  configuration: 0.05
};

/*
  Initial score thresholds.

  The supplied sample data appears to use Fahrenheit-like
  temperature values, such as 86, 95, etc. Verify the actual
  unit before operationalizing thermal thresholds.
*/
const FCI_HEALTH_THRESHOLDS = {
  telemetryAgeHours: {
    healthy: 24,
    watch: 72,
    warning: 168
  },

  /*
    RSSI-like values. Confirm exact signal field scale with
    the CFCI/vendor team before applying as approved thresholds.
  */
  signalStrength: {
    strong: -80,
    acceptable: -90,
    weak: -100
  },

  /*
    Retry counter may be cumulative. For now this is only a
    snapshot evaluation. A future Databricks history table
    should calculate retry counter increase/rate over time.
  */
  retryCounter: {
    low: 0,
    watch: 5,
    warning: 20
  },

  /*
    Example Fahrenheit-oriented thresholds.
    Validate with engineering/vendor specifications.
  */
  conductorTemp: {
    healthy: 140,
    watch: 165,
    warning: 190
  },

  thermalDelta: {
    healthy: 25,
    watch: 45,
    warning: 65
  },

  peakTripRatio: {
    healthy: 0.50,
    watch: 0.75,
    warning: 1.00
  },

  faultAgeHours: {
    recentCritical: 24,
    recentWarning: 24 * 7,
    recentWatch: 24 * 30
  }
};

/* Converts text/numeric values safely to a number. */
function toNumber(value) {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    String(value).trim() === ""
  ) {
    return null;
  }

  const parsed = Number(String(value).replace(/,/g, "").trim());

  return Number.isFinite(parsed) ? parsed : null;
}

/* Keeps component scores between 0 and 10. */
function clampScore(value) {
  return Math.max(0, Math.min(10, value));
}

/* Average only the values that exist. */
function averageScores(scores) {
  const valid = scores.filter(value =>
    value !== undefined &&
    value !== null &&
    Number.isFinite(value)
  );

  if (!valid.length) return null;

  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

/*
  Supports readable timestamps from the "(time)" columns.

  Examples:
  2026-08-13 11:46:40.979
  2026-08-13T11:46:40.979
*/
function parseTelemetryDate(value) {
  if (!hasTelemetryValue(value)) return null;

  const text = String(value).trim();

  /*
    Some browsers parse "YYYY-MM-DD HH:mm:ss" inconsistently.
    Convert the space between date/time into a T first.
  */
  const normalized = text.replace(
    /^(\d{4}-\d{2}-\d{2})\s/,
    "$1T"
  );

  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

function hoursSince(value) {
  const date = parseTelemetryDate(value);

  if (!date) return null;

  return (Date.now() - date.getTime()) / (1000 * 60 * 60);
}

function daysSince(value) {
  const hours = hoursSince(value);

  return hours === null ? null : hours / 24;
}

function displayNumber(value, decimals = 1) {
  const number = toNumber(value);

  return number === null ? "Not reported" : number.toFixed(decimals);
}

function displayHours(value) {
  if (value === null || !Number.isFinite(value)) {
    return "Not reported";
  }

  if (value < 1) {
    return `${Math.max(0, Math.round(value * 60))} min`;
  }

  if (value < 48) {
    return `${value.toFixed(1)} hr`;
  }

  return `${(value / 24).toFixed(1)} days`;
}

/*
  Returns score color based on requested ranges:

  7–10: green
  5–7: yellow
  3–5: orange
  0–3: red
*/
function fciScoreColor(score) {
  if (score === null || !Number.isFinite(score)) return "#63717b";

  if (score >= 7) return "#47dc93";
  if (score >= 5) return "#f4d35e";
  if (score >= 3) return "#f4a64e";

  return "#ff6570";
}

function fciScoreLabel(score) {
  if (score === null || !Number.isFinite(score)) {
    return "Unknown";
  }

  if (score >= 7) return "Healthy";
  if (score >= 5) return "Watch";
  if (score >= 3) return "Warning";

  return "Critical";
}

/*
  Gets every populated CFCI channel for one Smart Controller.
*/
function getPopulatedCfciChannels(telemetry) {
  const channels = [];

  for (let channel = 1; channel <= 12; channel++) {
    const prefix = `FCI-${channel}`;

    const values = {
      channel,

      routineTime: telemetryTime(
        telemetry,
        `${prefix} Routine Data Timestamp`
      ),

      signalStrength:
        telemetry[`${prefix} Last Receive Signal Strength`],

      retryCounter:
        telemetry[`${prefix} RF Transmission Retry Counter`],

      momentaryFaultCount:
        telemetry[`${prefix} Momentary Fault Count`],

      permanentFaultCount:
        telemetry[`${prefix} Permanent Fault Count`],

      lastFaultTime: telemetryTime(
        telemetry,
        `${prefix} Last Fault Timestamp`
      ),

      lastPermanentTime: telemetryTime(
        telemetry,
        `${prefix} Last Permanent Timestamp`
      ),

      lastFaultCurrent:
        telemetry[`${prefix} Last Fault Current (Amps)`],

      conductorTemp:
        telemetry[`${prefix} Conductor Temperature`],

      maxConductorTemp:
        telemetry[`${prefix} Maximum Conductor Temperature`],

      ambientTemp:
        telemetry[`${prefix} Ambient Temperature`],

      maxAmbientTemp:
        telemetry[`${prefix} Maximum Ambient Temperature`],

      actualCurrent:
        telemetry[`${prefix} Actual Current`],

      peakCurrent:
        telemetry[`${prefix} Peak Current (Amps)`],

      tripLevel:
        telemetry[`${prefix} Trip Level`],

      lossCurrentTime: telemetryTime(
        telemetry,
        `${prefix} Loss of Current Timestamp`
      ),

      lossVoltageTime: telemetryTime(
        telemetry,
        `${prefix} Loss of Voltage Timestamp`
      ),

      serialAddress:
        telemetry[`${prefix} Serial Address`]
    };

    const hasChannelData = [
      values.routineTime,
      values.signalStrength,
      values.actualCurrent,
      values.peakCurrent,
      values.momentaryFaultCount,
      values.permanentFaultCount,
      values.serialAddress
    ].some(hasTelemetryValue);

    if (hasChannelData) {
      channels.push(values);
    }
  }

  return channels;
}

/*
  Finds a worst-case / highest-impact value from a channel list.
*/
function maxNumberFromChannels(channels, field) {
  const values = channels
    .map(channel => toNumber(channel[field]))
    .filter(value => value !== null);

  return values.length ? Math.max(...values) : null;
}

function minNumberFromChannels(channels, field) {
  const values = channels
    .map(channel => toNumber(channel[field]))
    .filter(value => value !== null);

  return values.length ? Math.min(...values) : null;
}

function newestTimestampFromChannels(channels, fields) {
  const dates = [];

  channels.forEach(channel => {
    fields.forEach(field => {
      const date = parseTelemetryDate(channel[field]);

      if (date) {
        dates.push(date);
      }
    });
  });

  if (!dates.length) return null;

  const latest = new Date(Math.max(...dates.map(date => date.getTime())));

  return latest.toISOString();
}

/*
  Component: Communication Health

  Inputs:
  - telemetry/routine-data age
  - weakest signal strength
  - highest RF retry count
  - CommLost Diagnostic
*/
function calculateCommunicationScore(telemetry, channels) {
  const newestRoutineTime = newestTimestampFromChannels(
    channels,
    ["routineTime"]
  );

  const telemetryAgeHours = hoursSince(newestRoutineTime);

  let freshnessScore = null;

  if (telemetryAgeHours !== null) {
    const t = FCI_HEALTH_THRESHOLDS.telemetryAgeHours;

    if (telemetryAgeHours <= t.healthy) freshnessScore = 10;
    else if (telemetryAgeHours <= t.watch) freshnessScore = 7;
    else if (telemetryAgeHours <= t.warning) freshnessScore = 4;
    else freshnessScore = 0;
  }

  const weakestSignal = minNumberFromChannels(
    channels,
    "signalStrength"
  );

  let signalScore = null;

  if (weakestSignal !== null) {
    const s = FCI_HEALTH_THRESHOLDS.signalStrength;

    if (weakestSignal >= s.strong) signalScore = 10;
    else if (weakestSignal >= s.acceptable) signalScore = 7;
    else if (weakestSignal >= s.weak) signalScore = 4;
    else signalScore = 1;
  }

  const highestRetryCounter = maxNumberFromChannels(
    channels,
    "retryCounter"
  );

  let retryScore = null;

  if (highestRetryCounter !== null) {
    const r = FCI_HEALTH_THRESHOLDS.retryCounter;

    if (highestRetryCounter <= r.low) retryScore = 10;
    else if (highestRetryCounter <= r.watch) retryScore = 7;
    else if (highestRetryCounter <= r.warning) retryScore = 4;
    else retryScore = 1;
  }

  const commLostRaw = telemetry["CommLost Diagnostic"];
  const commLost = toNumber(commLostRaw);

  let commLostScore = null;

  if (commLost !== null) {
    commLostScore = commLost === 0 ? 10 : 0;
  }

  const score = averageScores([
    freshnessScore,
    signalScore,
    retryScore,
    commLostScore
  ]);

  return {
    score,
    telemetryAgeHours,
    freshnessScore,
    weakestSignal,
    signalScore,
    highestRetryCounter,
    retryScore,
    commLostRaw,
    commLostScore
  };
}

/*
  Component: Fault / Reliability Health

  Important:
  Fault counts are snapshot counters. Long term, calculate the
  counter deltas in Databricks to identify newly occurring faults.
*/
function calculateFaultScore(channels) {
  const permanentFaultCount = maxNumberFromChannels(
    channels,
    "permanentFaultCount"
  );

  const momentaryFaultCount = maxNumberFromChannels(
    channels,
    "momentaryFaultCount"
  );

  const newestFaultTime = newestTimestampFromChannels(
    channels,
    ["lastFaultTime", "lastPermanentTime"]
  );

  const lastFaultAgeHours = hoursSince(newestFaultTime);

  const highestFaultCurrent = maxNumberFromChannels(
    channels,
    "lastFaultCurrent"
  );

  let permanentScore = null;

  if (permanentFaultCount !== null) {
    if (permanentFaultCount === 0) permanentScore = 10;
    else if (permanentFaultCount === 1) permanentScore = 5;
    else permanentScore = 0;
  }

  let momentaryScore = null;

  if (momentaryFaultCount !== null) {
    if (momentaryFaultCount === 0) momentaryScore = 10;
    else if (momentaryFaultCount <= 3) momentaryScore = 7;
    else if (momentaryFaultCount <= 10) momentaryScore = 4;
    else momentaryScore = 1;
  }

  let recencyScore = null;

  if (lastFaultAgeHours !== null) {
    const t = FCI_HEALTH_THRESHOLDS.faultAgeHours;

    if (lastFaultAgeHours > t.recentWatch) recencyScore = 10;
    else if (lastFaultAgeHours > t.recentWarning) recencyScore = 7;
    else if (lastFaultAgeHours > t.recentCritical) recencyScore = 4;
    else recencyScore = 1;
  }

  const score = averageScores([
    permanentScore,
    momentaryScore,
    recencyScore
  ]);

  return {
    score,
    permanentFaultCount,
    permanentScore,
    momentaryFaultCount,
    momentaryScore,
    newestFaultTime,
    lastFaultAgeHours,
    recencyScore,
    highestFaultCurrent
  };
}

/*
  Component: Thermal Health

  Inputs:
  - maximum conductor temperature
  - maximum conductor-to-ambient thermal delta
*/
function calculateThermalScore(channels) {
  const maxConductorTemp = maxNumberFromChannels(
    channels,
    "maxConductorTemp"
  );

  const maxCurrentConductorTemp = maxNumberFromChannels(
    channels,
    "conductorTemp"
  );

  const maxAmbientTemp = maxNumberFromChannels(
    channels,
    "maxAmbientTemp"
  );

  const maxCurrentAmbientTemp = maxNumberFromChannels(
    channels,
    "ambientTemp"
  );

  /*
    Use current values where available. Otherwise use max values.
    This is an approximation because max conductor and max ambient
    may not have occurred at the same timestamp.
  */
  const conductorForDelta =
    maxCurrentConductorTemp ?? maxConductorTemp;

  const ambientForDelta =
    maxCurrentAmbientTemp ?? maxAmbientTemp;

  const thermalDelta =
    conductorForDelta !== null && ambientForDelta !== null
      ? conductorForDelta - ambientForDelta
      : null;

  let temperatureScore = null;

  if (maxConductorTemp !== null) {
    const t = FCI_HEALTH_THRESHOLDS.conductorTemp;

    if (maxConductorTemp <= t.healthy) temperatureScore = 10;
    else if (maxConductorTemp <= t.watch) temperatureScore = 7;
    else if (maxConductorTemp <= t.warning) temperatureScore = 4;
    else temperatureScore = 1;
  }

  let deltaScore = null;

  if (thermalDelta !== null) {
    const d = FCI_HEALTH_THRESHOLDS.thermalDelta;

    if (thermalDelta <= d.healthy) deltaScore = 10;
    else if (thermalDelta <= d.watch) deltaScore = 7;
    else if (thermalDelta <= d.warning) deltaScore = 4;
    else deltaScore = 1;
  }

  const score = averageScores([
    temperatureScore,
    deltaScore
  ]);

  return {
    score,
    maxConductorTemp,
    maxAmbientTemp,
    thermalDelta,
    temperatureScore,
    deltaScore
  };
}

/*
  Component: Electrical / Load Health

  Inputs:
  - peak current / trip level ratio
  - recent loss-of-current or loss-of-voltage events

  Important:
  Trip level is not necessarily an ampacity/load rating. This
  ratio should be treated as a monitoring indicator only unless
  engineering confirms its appropriate use.
*/
function calculateElectricalScore(channels) {
  const ratios = [];

  channels.forEach(channel => {
    const peak = toNumber(channel.peakCurrent);
    const trip = toNumber(channel.tripLevel);

    if (peak !== null && trip !== null && trip > 0) {
      ratios.push(peak / trip);
    }
  });

  const highestPeakTripRatio = ratios.length
    ? Math.max(...ratios)
    : null;

  const newestLossTime = newestTimestampFromChannels(
    channels,
    ["lossCurrentTime", "lossVoltageTime"]
  );

  const lossAgeHours = hoursSince(newestLossTime);

  let peakTripScore = null;

  if (highestPeakTripRatio !== null) {
    const r = FCI_HEALTH_THRESHOLDS.peakTripRatio;

    if (highestPeakTripRatio < r.healthy) peakTripScore = 10;
    else if (highestPeakTripRatio < r.watch) peakTripScore = 7;
    else if (highestPeakTripRatio < r.warning) peakTripScore = 4;
    else peakTripScore = 1;
  }

  let lossEventScore = null;

  if (lossAgeHours !== null) {
    if (lossAgeHours > 24 * 30) lossEventScore = 10;
    else if (lossAgeHours > 24 * 7) lossEventScore = 7;
    else if (lossAgeHours > 24) lossEventScore = 4;
    else lossEventScore = 1;
  }

  const score = averageScores([
    peakTripScore,
    lossEventScore
  ]);

  return {
    score,
    highestPeakTripRatio,
    peakTripScore,
    newestLossTime,
    lossAgeHours,
    lossEventScore
  };
}

/*
  Component: Configuration Health

  Inputs:
  - firmware available
  - controller serial available
  - Flag Count
  - populated channels missing serial addresses
*/
function calculateConfigurationScore(telemetry, channels) {
  const firmware = telemetry["Smart Controller FW Version"];
  const controllerSerial =
    telemetry["Smart Controller Serial Number"];

  const flagCount = toNumber(telemetry["Flag Count"]);

  const missingSerialCount = channels.filter(channel =>
    !hasTelemetryValue(channel.serialAddress)
  ).length;

  const firmwareScore = hasTelemetryValue(firmware) ? 10 : 4;
  const serialScore = hasTelemetryValue(controllerSerial) ? 10 : 4;

  let flagScore = null;

  if (flagCount !== null) {
    if (flagCount === 0) flagScore = 10;
    else if (flagCount <= 2) flagScore = 7;
    else if (flagCount <= 5) flagScore = 4;
    else flagScore = 1;
  }

  let channelSetupScore = null;

  if (channels.length) {
    const missingRatio = missingSerialCount / channels.length;

    if (missingRatio === 0) channelSetupScore = 10;
    else if (missingRatio <= 0.25) channelSetupScore = 7;
    else if (missingRatio <= 0.50) channelSetupScore = 4;
    else channelSetupScore = 1;
  }

  const score = averageScores([
    firmwareScore,
    serialScore,
    flagScore,
    channelSetupScore
  ]);

  return {
    score,
    firmware,
    firmwareScore,
    controllerSerial,
    serialScore,
    flagCount,
    flagScore,
    populatedChannels: channels.length,
    missingSerialCount,
    channelSetupScore
  };
}

/*
  Full weighted FCI health model.
*/
function calculateFciHealthScore(device) {
  const telemetry = getCfciTelemetry(device);

  if (!telemetry) {
    return {
      available: false,
      overallScore: null,
      status: "Unknown",
      color: fciScoreColor(null)
    };
  }

  const channels = getPopulatedCfciChannels(telemetry);

  if (!channels.length) {
    return {
      available: false,
      overallScore: null,
      status: "Unknown",
      color: fciScoreColor(null)
    };
  }

  const communication = calculateCommunicationScore(
    telemetry,
    channels
  );

  const fault = calculateFaultScore(channels);
  const thermal = calculateThermalScore(channels);
  const electrical = calculateElectricalScore(channels);
  const configuration = calculateConfigurationScore(
    telemetry,
    channels
  );
const controller = getCfciControllerStatus(device);

if (controller) {
  const controllerAlarms = buildCfciControllerAlarms(device);

  const hasCriticalControllerAlarm = controllerAlarms.some(
    alarm => alarm.severity === "critical"
  );

  const hasWarningControllerAlarm = controllerAlarms.some(
    alarm => alarm.severity === "warning"
  );

  /*
    Controller alarms affect existing health dimensions.
    They do not change the original 35/30/20/10/5 weights.
  */
  if (hasCriticalControllerAlarm) {
    communication.score = Math.min(communication.score ?? 10, 1);
    electrical.score = Math.min(electrical.score ?? 10, 1);
    configuration.score = Math.min(configuration.score ?? 10, 2);
  } else if (hasWarningControllerAlarm) {
    communication.score = Math.min(communication.score ?? 10, 5);
    electrical.score = Math.min(electrical.score ?? 10, 6);
    configuration.score = Math.min(configuration.score ?? 10, 6);
  }
}
  /*
    If a component has no usable data, do not treat it as zero.
    Instead, calculate the weighted result from the available
    components only.
  */
  const components = [
    {
      key: "communication",
      label: "Communication",
      weight: FCI_HEALTH_WEIGHTS.communication,
      score: communication.score
    },
    {
      key: "fault",
      label: "Fault / Reliability",
      weight: FCI_HEALTH_WEIGHTS.fault,
      score: fault.score
    },
    {
      key: "thermal",
      label: "Thermal",
      weight: FCI_HEALTH_WEIGHTS.thermal,
      score: thermal.score
    },
    {
      key: "electrical",
      label: "Electrical / Load",
      weight: FCI_HEALTH_WEIGHTS.electrical,
      score: electrical.score
    },
    {
      key: "configuration",
      label: "Configuration",
      weight: FCI_HEALTH_WEIGHTS.configuration,
      score: configuration.score
    }
  ];

  const availableComponents = components.filter(component =>
    component.score !== null &&
    Number.isFinite(component.score)
  );

  const availableWeight = availableComponents.reduce(
    (sum, component) => sum + component.weight,
    0
  );

  const weightedScore = availableWeight
    ? availableComponents.reduce(
        (sum, component) =>
          sum + component.score * component.weight,
        0
      ) / availableWeight
    : null;

  const overallScore = weightedScore === null
    ? null
    : clampScore(weightedScore);

  return {
    available: overallScore !== null,
    overallScore,
    status: fciScoreLabel(overallScore),
    color: fciScoreColor(overallScore),
    components,
    channels,
    communication,
    fault,
    thermal,
    electrical,
    configuration
  };
}

/*
  Donut HTML for the top-right score graphic.
*/
function renderFciHealthDonut(health) {
  if (!health.available) {
    return `
      <div class="fci-health-donut fci-health-donut-na">
        <div class="fci-health-donut-center">
          <strong>N/A</strong>
          <span>No data</span>
        </div>
      </div>
    `;
  }

  const percentage = Math.max(
    0,
    Math.min(100, health.overallScore * 10)
  );

  return `
    <div
      class="fci-health-donut"
      style="
        --fci-score-color: ${health.color};
        --fci-score-percent: ${percentage}%;
      "
      title="FCI Health Score: ${health.overallScore.toFixed(1)} / 10"
    >
      <div class="fci-health-donut-center">
        <strong>${health.overallScore.toFixed(1)}</strong>
        <span>/ 10</span>
      </div>
    </div>
  `;
}

/*
  Renders the transparent calculation breakdown under the
  identity/status portion of the detail panel.
*/
function renderFciHealthBreakdown(health) {
  if (!health.available) {
    return `
      <div class="fci-health-breakdown">
        <div class="fci-health-breakdown-title">
          <span>FCI Health Score</span>
          <span class="fci-health-status neutral">Unknown</span>
        </div>

        <div class="fci-health-no-data">
          No CFCI telemetry is available for this device, so a
          health score cannot be calculated.
        </div>
      </div>
    `;
  }

  const c = health.communication;
  const f = health.fault;
  const t = health.thermal;
  const e = health.electrical;
  const g = health.configuration;

  const componentRow = (label, weight, score, details) => `
    <details class="fci-score-component" open>
      <summary>
        <span>${label}</span>
        <span>
          <b>${score === null ? "N/A" : score.toFixed(1)}</b>
          <em>${Math.round(weight * 100)}%</em>
        </span>
      </summary>

      <div class="fci-score-component-body">
        ${details}
      </div>
    </details>
  `;

  const metric = (label, value, score) => `
    <div class="fci-score-metric">
      <span>${label}</span>
      <span>
        <b>${value}</b>
        ${score === null || score === undefined
          ? ""
          : `<em>→ ${score.toFixed(1)}/10</em>`}
      </span>
    </div>
  `;

  return `
    <div class="fci-health-breakdown">
      <div class="fci-health-breakdown-title">
        <span>FCI Health Score</span>
        <span
          class="fci-health-status"
          style="
            color:${health.color};
            border-color:${health.color}55;
            background:${health.color}1a;
          "
        >
          ${health.status}
        </span>
      </div>

      <div class="fci-score-formula">
        <span>Overall Formula</span>
        <code>
          (${c.score?.toFixed(1) ?? "N/A"} × 35%)
          + (${f.score?.toFixed(1) ?? "N/A"} × 30%)
          + (${t.score?.toFixed(1) ?? "N/A"} × 20%)
          + (${e.score?.toFixed(1) ?? "N/A"} × 10%)
          + (${g.score?.toFixed(1) ?? "N/A"} × 5%)
          = ${health.overallScore.toFixed(1)} / 10
        </code>
      </div>

      ${componentRow(
        "Communication Health",
        FCI_HEALTH_WEIGHTS.communication,
        c.score,
        `
          ${metric(
            "Telemetry Age",
            displayHours(c.telemetryAgeHours),
            c.freshnessScore
          )}

          ${metric(
            "Weakest RSSI",
            c.weakestSignal === null
              ? "Not reported"
              : `${c.weakestSignal} dBm`,
            c.signalScore
          )}

          ${metric(
            "Highest Retry Counter",
            c.highestRetryCounter === null
              ? "Not reported"
              : c.highestRetryCounter,
            c.retryScore
          )}

          ${metric(
            "CommLost Diagnostic",
            c.commLostRaw === undefined ||
            c.commLostRaw === null ||
            c.commLostRaw === ""
              ? "Not reported"
              : c.commLostRaw,
            c.commLostScore
          )}

          <div class="fci-score-rule">
            Component score = average of available freshness,
            RSSI, retry, and CommLost input scores.
          </div>
        `
      )}

      ${componentRow(
        "Fault / Reliability Health",
        FCI_HEALTH_WEIGHTS.fault,
        f.score,
        `
          ${metric(
            "Highest Permanent Fault Count",
            f.permanentFaultCount === null
              ? "Not reported"
              : f.permanentFaultCount,
            f.permanentScore
          )}

          ${metric(
            "Highest Momentary Fault Count",
            f.momentaryFaultCount === null
              ? "Not reported"
              : f.momentaryFaultCount,
            f.momentaryScore
          )}

          ${metric(
            "Most Recent Fault Age",
            displayHours(f.lastFaultAgeHours),
            f.recencyScore
          )}

          ${metric(
            "Highest Last Fault Current",
            f.highestFaultCurrent === null
              ? "Not reported"
              : `${f.highestFaultCurrent} A`,
            null
          )}

          <div class="fci-score-rule">
            Component score = average of permanent fault,
            momentary fault, and fault-recency scores.
          </div>
        `
      )}

      ${componentRow(
        "Thermal Health",
        FCI_HEALTH_WEIGHTS.thermal,
        t.score,
        `
          ${metric(
            "Maximum Conductor Temperature",
            t.maxConductorTemp === null
              ? "Not reported"
              : t.maxConductorTemp,
            t.temperatureScore
          )}

          ${metric(
            "Maximum Ambient Temperature",
            t.maxAmbientTemp === null
              ? "Not reported"
              : t.maxAmbientTemp,
            null
          )}

          ${metric(
            "Thermal Delta",
            t.thermalDelta === null
              ? "Not reported"
              : `${t.thermalDelta.toFixed(1)}°`,
            t.deltaScore
          )}

          <div class="fci-score-rule">
            Thermal Delta = Conductor Temperature − Ambient Temperature.
            Verify temperature units and thresholds with Engineering.
          </div>
        `
      )}

      ${componentRow(
        "Electrical / Load Health",
        FCI_HEALTH_WEIGHTS.electrical,
        e.score,
        `
          ${metric(
            "Highest Peak / Trip Ratio",
            e.highestPeakTripRatio === null
              ? "Not reported"
              : e.highestPeakTripRatio.toFixed(2),
            e.peakTripScore
          )}

          ${metric(
            "Most Recent Loss Event Age",
            displayHours(e.lossAgeHours),
            e.lossEventScore
          )}

          <div class="fci-score-rule">
            Peak / Trip Ratio = Peak Current ÷ Trip Level.
            Treat as an operational indicator until approved by
            Protection Engineering.
          </div>
        `
      )}

      ${componentRow(
        "Configuration Health",
        FCI_HEALTH_WEIGHTS.configuration,
        g.score,
        `
          ${metric(
            "Firmware Version",
            formatTelemetryValue(g.firmware),
            g.firmwareScore
          )}

          ${metric(
            "Controller Serial",
            formatTelemetryValue(g.controllerSerial),
            g.serialScore
          )}

          ${metric(
            "Flag Count",
            g.flagCount === null
              ? "Not reported"
              : g.flagCount,
            g.flagScore
          )}

          ${metric(
            "Channels With Missing Serial Address",
            `${g.missingSerialCount} of ${g.populatedChannels}`,
            g.channelSetupScore
          )}

          <div class="fci-score-rule">
            Component score = average of firmware, controller
            identity, flags, and channel configuration scores.
          </div>
        `
      )}

      <div class="fci-score-disclaimer">
        Initial scoring model only. Validate telemetry units,
        reporting intervals, fault interpretations, and thresholds
        with CFCI vendor documentation and PECO engineering standards.
      </div>
    </div>
  `;
}

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
/* ==========================================================
   DEVICE TABLE ALARM SUMMARY / ALARM PILL
   ========================================================== */

/*
  Determines an alarm category from the existing controller
  alarm title. This also works with your current alarm objects
  that use severity, title, and detail.
*/
function getAlarmType(alarm) {
  const text = `${alarm.title || ""} ${alarm.detail || ""}`.toLowerCase();

  if (
    text.includes("ac power") ||
    text.includes("ac outage") ||
    text.includes("battery") ||
    text.includes("fuse")
  ) {
    return "power";
  }

  if (
    text.includes("communication") ||
    text.includes("commlost") ||
    text.includes("radio") ||
    text.includes("session") ||
    text.includes("retries") ||
    text.includes("transmission")
  ) {
    return "communication";
  }

  return "configuration";
}

function getDeviceAlarmSummary(device) {
  /*
    Alarm data currently applies only to FCI/CFCI devices.
  */
  if (device.category !== "FCI") {
    return {
      hasControllerData: null,
      alarms: [],
      highestSeverity: null
    };
  }

  const controller = getCfciControllerStatus(device);

  if (!controller) {
    return {
      hasControllerData: false,
      alarms: [],
      highestSeverity: null
    };
  }

  const alarms = buildCfciControllerAlarms(device).map(alarm => ({
    ...alarm,
    type: alarm.type || getAlarmType(alarm)
  }));

  const highestSeverity =
    alarms.some(alarm => alarm.severity === "critical") ? "critical" :
    alarms.some(alarm => alarm.severity === "warning") ? "warning" :
    alarms.some(alarm => alarm.severity === "watch") ? "watch" :
    "normal";

  return {
    hasControllerData: true,
    alarms,
    highestSeverity
  };
}

function renderDeviceAlarmPill(device) {
  const summary = getDeviceAlarmSummary(device);

  /* IntelliRupters and Reclosers do not yet have controller alarm data */
  if (device.category !== "FCI") {
    return `<span class="alarm-pill na">—</span>`;
  }

  if (!summary.hasControllerData) {
    return `<span class="alarm-pill no-data">No Data</span>`;
  }

  if (!summary.alarms.length) {
    return `<span class="alarm-pill normal">Normal</span>`;
  }

  const criticalCount = summary.alarms.filter(
    alarm => alarm.severity === "critical"
  ).length;

  const warningCount = summary.alarms.filter(
    alarm => alarm.severity === "warning"
  ).length;

  const watchCount = summary.alarms.filter(
    alarm => alarm.severity === "watch"
  ).length;

  const label =
    criticalCount ? `Critical · ${criticalCount}` :
    warningCount ? `Warning · ${warningCount}` :
    `Watch · ${watchCount}`;

  return `
    <span
      class="alarm-pill ${summary.highestSeverity}"
      title="${summary.alarms.map(alarm => alarm.title).join(" | ")}"
    >
      ${label}
    </span>
  `;
}
/* ══ DEVICES page (category-wide search incl. Product ID) ══ */
function renderDevices() {
  const q = (document.getElementById("d-search").value || "")
    .toLowerCase();

  const cat = document.getElementById("d-cat").value;
  const comm = document.getElementById("d-comm").value;
  const life = document.getElementById("d-life").value;
  const provider = document.getElementById("d-prov").value;
  const alarmFilter = document.getElementById("d-alarm").value;

  const rows = Fleet.devices.filter(device => {
    if (cat && device.category !== cat) return false;
    if (comm && device.commStatus !== comm) return false;
    if (life && device.lifecycle !== life) return false;
    if (provider && device.provider !== provider) return false;

    if (
      q &&
      !(
        device.id.toLowerCase().includes(q) ||
        device.product.toLowerCase().includes(q) ||
        device.location.toLowerCase().includes(q) ||
        device.substation.toLowerCase().includes(q) ||
        device.category.toLowerCase().includes(q)
      )
    ) {
      return false;
    }

    /*
      Alarm filtering applies only to FCI devices because only
      FCI/CFCI controller alarm data is currently loaded.
    */
    if (alarmFilter) {
      const summary = getDeviceAlarmSummary(device);

      if (alarmFilter === "no-data") {
        if (device.category !== "FCI" || summary.hasControllerData !== false) {
          return false;
        }
      } else {
        /*
          Any actual alarm filter excludes non-FCI devices.
        */
        if (device.category !== "FCI") return false;

        const alarms = summary.alarms;

        if (alarmFilter === "any" && !alarms.length) return false;

        if (
          ["critical", "warning", "watch"].includes(alarmFilter) &&
          !alarms.some(alarm => alarm.severity === alarmFilter)
        ) {
          return false;
        }

        if (
          ["communication", "power", "configuration"].includes(alarmFilter) &&
          !alarms.some(alarm => alarm.type === alarmFilter)
        ) {
          return false;
        }
      }
    }

    return true;
  });

  document.getElementById("d-count").textContent =
    `${rows.length} of ${Fleet.devices.length}`;

  document.getElementById("dev-tbody").innerHTML = rows.map(device => {
    const meta = catMeta(device.category);

    return `
      <tr class="clickable" data-key="${device.category}|${device.id}">
        <td class="mono">${device.id}</td>

        <td>
          <span class="cat-chip">
            <span class="cd" style="background:${meta.color}"></span>
            ${meta.label}
          </span>
        </td>

        <td>${device.product}</td>
        <td>${device.substation}</td>

        <td>
          <span class="tag ${tagCls[device.commStatus] || "nis"}">
            ${device.commStatus}
          </span>
        </td>

        <td>${renderDeviceAlarmPill(device)}</td>

        <td>
          <span class="tag ${lifeCls[device.lifecycle]}">
            ${device.lifecycle}
          </span>
        </td>

        <td>${device.provider}</td>

        <td class="row-chevron">›</td>
      </tr>
    `;
  }).join("") || `
    <tr>
      <td colspan="9" class="muted" style="text-align:center;padding:24px">
        No devices match these filters.
      </td>
    </tr>
  `;
}

/* Open the PECO Electric Facilities WebApp at the selected device coordinates */
function openPecoFacilitiesMap(lat, lng, deviceId = "") {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    alert("This device does not have valid latitude/longitude coordinates.");
    return;
  }

  const baseUrl =
    "https://portal.exelonutilities.com/portal/apps/webappviewer/index.html";

  const params = new URLSearchParams({
    id: "9a325b005ead4460a7b64ffdefcecdb8",

    /*
      ArcGIS Web AppBuilder expects center as:
      longitude,latitude
    */
    center: `${lng},${lat}`,

    /*
      Higher number = closer zoom.
      18 is typically close enough to inspect utility assets.
    */
    level: "18"
  });

  const mapUrl = `${baseUrl}?${params.toString()}`;

  console.log(
    `Opening PECO Facilities map for ${deviceId || "device"}:`,
    mapUrl
  );

  window.open(mapUrl, "_blank", "noopener");
}

/* Open selected device coordinates in Google Maps */
function openGoogleMaps(lat, lng, deviceId = "") {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    alert("This device does not have valid latitude/longitude coordinates.");
    return;
  }

  /*
    Google Maps URL format:
    https://www.google.com/maps/search/?api=1&query=LATITUDE,LONGITUDE
  */
  const googleMapsUrl =
    `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  console.log(
    `Opening Google Maps for ${deviceId || "device"}:`,
    googleMapsUrl
  );

  window.open(googleMapsUrl, "_blank", "noopener");
}

/* ══ device detail panel ══ */
function openDetail(key) {
  const d = Fleet.devices.find(x => x.category + '|' + x.id === key);
if (!d) return;

const meta = catMeta(d.category);

/*
  Only calculate the score for FCI/CFCI devices.
*/
const fciHealth = d.category === "FCI"
  ? calculateFciHealthScore(d)
  : null;
  const val = (v, cls = '') => v == null || v === '' || v === '—'
    ? `<span class="dv none">Not provided in export</span>`
    : `<span class="dv ${cls}">${v}</span>`;
  const row = (k, v, cls) => `<div class="d-row"><span class="dk">${k}</span>${val(v, cls)}</div>`;
  const coords = d.lat != null ? `${d.lat.toFixed(6)}, ${d.lng.toFixed(6)}` : null;

  document.getElementById('detail-content').innerHTML = `
  <div class="detail-device-header">
    <div class="detail-device-header-main">
      <div class="d-eyebrow">${meta.label}</div>
      <div class="d-title">${d.id}</div>

      <div class="d-tags">
        <span class="tag ${tagCls[d.commStatus] || 'nis'}">${d.commStatus}</span>
        <span class="tag ${lifeCls[d.lifecycle]}">${d.lifecycle}</span>
      </div>
    </div>

    ${fciHealth ? `
      <div class="detail-fci-score">
        ${renderFciHealthDonut(fciHealth)}
        <div class="detail-fci-score-label">
          FCI Health
        </div>
      </div>
    ` : ""}
  </div>

  ${fciHealth ? renderFciHealthBreakdown(fciHealth) : ""}

    <div class="d-section">
      <h4>Location</h4>
      ${row('Location', d.cleanLocation)}
      ${d.location !== d.cleanLocation ? row('Raw Location', d.location) : ''}
      ${row('Substation', d.substation)}
      ${row('Coordinates', coords, 'mono')}
      <div class="detail-map-buttons">
  <button
    class="d-btn"
    ${coords ? "" : "disabled"}
    onclick="${coords ? `showDeviceOnMap('${key}')` : ""}"
  >
    ${coords ? "◉ View in Fleet Map" : "No coordinates to map"}
  </button>

  <button
    class="d-btn d-btn-external"
    ${coords ? "" : "disabled"}
    onclick="${coords ? `openPecoFacilitiesMap(${d.lat}, ${d.lng}, '${d.id}')` : ""}"
  >
    ${coords ? "↗ PECO Facilities Map" : "No PECO map available"}
  </button>

  <button
    class="d-btn d-btn-google"
    ${coords ? "" : "disabled"}
    onclick="${coords ? `openGoogleMaps(${d.lat}, ${d.lng}, '${d.id}')` : ""}"
  >
    ${coords ? "↗ Open Google Maps" : "No Google Maps location"}
  </button>
</div>
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
    </div>

    ${d.category === "FCI" ? renderCfciControllerStatus(d) : ""}

${d.category === "FCI" ? renderCfciTelemetryDetails(d) : ""}


  `;

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
  [
    "d-search",
    "d-cat",
    "d-comm",
    "d-life",
    "d-prov",
    "d-alarm"
  ].forEach(id => {
    document.getElementById(id).value = "";
  });

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
  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',    
    {
       attribution: '© OpenStreetMap © CARTO', 
       maxZoom: 19 }
      ).addTo(map);
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