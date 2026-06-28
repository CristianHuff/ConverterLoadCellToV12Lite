(function (bridge) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const state = {
    port: null,
    writer: null,
    reader: null,
    serialRxBuffer: "",
    running: false,
    lastLine: "",
    lastSend: 0,
    timer: 0,
    manualHoldUntil: 0,
    lastPct: { clutch: 0, brake: 0, throttle: 0 },
    dropStart: { clutch: 0, brake: 0, throttle: 0 },
    selectedGamepadId: localStorage.getItem(`${bridge.STORAGE_PREFIX}selectedGamepadId`) || "",
    lockGamepad: localStorage.getItem(`${bridge.STORAGE_PREFIX}lockGamepad`) !== "false",
    autoStart: localStorage.getItem(`${bridge.STORAGE_PREFIX}autoStart`) !== "false",
    calibration: {
      active: false,
      draft: {}
    }
  };

  const els = {
    gamepadStatus: document.querySelector("#gamepadStatus"),
    serialStatus: document.querySelector("#serialStatus"),
    sendStatus: document.querySelector("#sendStatus"),
    gamepadSelect: document.querySelector("#gamepadSelect"),
    lockGamepad: document.querySelector("#lockGamepad"),
    autoStart: document.querySelector("#autoStart"),
    pedalProfile: document.querySelector("#pedalProfile"),
    refreshGamepads: document.querySelector("#refreshGamepads"),
    connectSerial: document.querySelector("#connectSerial"),
    testThrottle: document.querySelector("#testThrottle"),
    testRest: document.querySelector("#testRest"),
    startBridge: document.querySelector("#startBridge"),
    stopBridge: document.querySelector("#stopBridge"),
    rate: document.querySelector("#rate"),
    deadzone: document.querySelector("#deadzone"),
    clutchDropoutGuard: document.querySelector("#clutchDropoutGuard"),
    brakeDropoutGuard: document.querySelector("#brakeDropoutGuard"),
    throttleDropoutGuard: document.querySelector("#throttleDropoutGuard"),
    curve0: document.querySelector("#curve0"),
    curve25: document.querySelector("#curve25"),
    curve50: document.querySelector("#curve50"),
    curve75: document.querySelector("#curve75"),
    curve100: document.querySelector("#curve100"),
    resetCurve: document.querySelector("#resetCurve"),
    detailedLog: document.querySelector("#detailedLog"),
    healthAlerts: document.querySelector("#healthAlerts"),
    recommendations: document.querySelector("#recommendations"),
    startLog: document.querySelector("#startLog"),
    downloadLog: document.querySelector("#downloadLog"),
    clearLog: document.querySelector("#clearLog"),
    markLog: document.querySelector("#markLog"),
    savePreset: document.querySelector("#savePreset"),
    loadPreset: document.querySelector("#loadPreset"),
    deletePreset: document.querySelector("#deletePreset"),
    presetSelect: document.querySelector("#presetSelect"),
    presetName: document.querySelector("#presetName"),
    exportConfig: document.querySelector("#exportConfig"),
    importConfig: document.querySelector("#importConfig"),
    resetDefaults: document.querySelector("#resetDefaults"),
    configImportFile: document.querySelector("#configImportFile"),
    log: document.querySelector("#log"),
    axisGrid: document.querySelector("#axisGrid"),
    curvePreview: document.querySelector("#curvePreview"),
    signalHistory: document.querySelector("#signalHistory"),
    txRate: document.querySelector("#txRate"),
    txCount: document.querySelector("#txCount"),
    guardCount: document.querySelector("#guardCount"),
    lastLine: document.querySelector("#lastLine"),
    clutchFill: document.querySelector("#clutchFill"),
    clutchValue: document.querySelector("#clutchValue"),
    brakeFill: document.querySelector("#brakeFill"),
    brakeValue: document.querySelector("#brakeValue"),
    throttleFill: document.querySelector("#throttleFill"),
    throttleValue: document.querySelector("#throttleValue"),
    clutchCaptureMin: document.querySelector("#clutchCaptureMin"),
    clutchCaptureMax: document.querySelector("#clutchCaptureMax"),
    brakeCaptureMin: document.querySelector("#brakeCaptureMin"),
    brakeCaptureMax: document.querySelector("#brakeCaptureMax"),
    throttleCaptureMin: document.querySelector("#throttleCaptureMin"),
    throttleCaptureMax: document.querySelector("#throttleCaptureMax"),
    captureAllMin: document.querySelector("#captureAllMin"),
    captureAllMax: document.querySelector("#captureAllMax"),
    startCalibration: document.querySelector("#startCalibration"),
    resetCalibration: document.querySelector("#resetCalibration"),
    captureCalibrationMin: document.querySelector("#captureCalibrationMin"),
    captureCalibrationMax: document.querySelector("#captureCalibrationMax"),
    applyCalibration: document.querySelector("#applyCalibration"),
    calibrationStatus: document.querySelector("#calibrationStatus"),
    calStepMin: document.querySelector("#calStepMin"),
    calStepMax: document.querySelector("#calStepMax"),
    calStepApply: document.querySelector("#calStepApply")
  };

  const controls = {
    clutch: controlRefs("clutch"),
    brake: controlRefs("brake"),
    throttle: controlRefs("throttle")
  };

  const detailedLogger = bridge.createDetailedLogger(els, currentSettings, writeStatus);
  const telemetry = bridge.createTelemetry(els);
  const health = bridge.createHealthMonitor(els, applyRecommendationAction);

  function controlRefs(key) {
    return {
      key,
      defaultAxis: bridge.PEDAL_DEFAULTS[key].axis,
      axis: document.querySelector(`#${key}Axis`),
      min: document.querySelector(`#${key}Min`),
      max: document.querySelector(`#${key}Max`),
      invert: document.querySelector(`#${key}Invert`),
      fill: document.querySelector(`#${key}Fill`),
      value: document.querySelector(`#${key}Value`)
    };
  }

  function writeStatus(message) {
    els.log.textContent = message;
  }

  function setPill(element, text, ok) {
    element.textContent = text;
    element.classList.toggle("ok", Boolean(ok));
    element.classList.toggle("warn", !ok);
  }

  function currentSettings() {
    return {
      schema: "gamepad-serial-bridge-settings-v1",
      rateHz: Number(els.rate.value),
      serialHeartbeatMs: bridge.SERIAL_HEARTBEAT_MS,
      pedalProfile: els.pedalProfile.value,
      customCurve: currentCustomCurve(),
      deadzonePct: Number(els.deadzone.value),
      dropoutGuardMs: currentDropoutGuards(),
      throttleDropoutGuardMs: Number(els.throttleDropoutGuard.value),
      lockGamepad: els.lockGamepad.checked,
      autoStart: els.autoStart.checked,
      selectedGamepadId: state.selectedGamepadId,
      mappings: Object.fromEntries(
        bridge.PEDAL_ORDER.map((key) => [
          key,
          {
            axis: Number(controls[key].axis.value),
            min: Number(controls[key].min.value),
            max: Number(controls[key].max.value),
            invert: controls[key].invert.checked
          }
        ])
      )
    };
  }

  function persistCurrentSettings() {
    localStorage.setItem(`${bridge.STORAGE_PREFIX}pedalProfile`, els.pedalProfile.value);
    localStorage.setItem(`${bridge.STORAGE_PREFIX}customCurve`, JSON.stringify(currentCustomCurve()));
    localStorage.setItem(`${bridge.STORAGE_PREFIX}rate`, els.rate.value);
    localStorage.setItem(`${bridge.STORAGE_PREFIX}deadzone`, els.deadzone.value);
    localStorage.setItem(`${bridge.STORAGE_PREFIX}clutchDropoutGuard`, els.clutchDropoutGuard.value);
    localStorage.setItem(`${bridge.STORAGE_PREFIX}brakeDropoutGuard`, els.brakeDropoutGuard.value);
    localStorage.setItem(`${bridge.STORAGE_PREFIX}throttleDropoutGuard`, els.throttleDropoutGuard.value);
    localStorage.setItem(`${bridge.STORAGE_PREFIX}lockGamepad`, String(els.lockGamepad.checked));
    localStorage.setItem(`${bridge.STORAGE_PREFIX}autoStart`, String(els.autoStart.checked));
    if (state.selectedGamepadId) {
      localStorage.setItem(`${bridge.STORAGE_PREFIX}selectedGamepadId`, state.selectedGamepadId);
    }
    bridge.PEDAL_ORDER.forEach((key) => savePedalSettings(controls[key]));
  }

  function applySettings(settings) {
    if (!settings || !settings.mappings) return false;

    if (settings.pedalProfile) els.pedalProfile.value = settings.pedalProfile;
    if (Array.isArray(settings.customCurve)) {
      setCustomCurve(settings.customCurve);
    }
    if (Number.isFinite(settings.rateHz)) els.rate.value = settings.rateHz;
    if (Number.isFinite(settings.deadzonePct)) els.deadzone.value = settings.deadzonePct;
    if (settings.dropoutGuardMs && typeof settings.dropoutGuardMs === "object") {
      if (Number.isFinite(settings.dropoutGuardMs.clutch)) els.clutchDropoutGuard.value = settings.dropoutGuardMs.clutch;
      if (Number.isFinite(settings.dropoutGuardMs.brake)) els.brakeDropoutGuard.value = settings.dropoutGuardMs.brake;
      if (Number.isFinite(settings.dropoutGuardMs.throttle)) els.throttleDropoutGuard.value = settings.dropoutGuardMs.throttle;
    } else if (Number.isFinite(settings.throttleDropoutGuardMs)) {
      els.throttleDropoutGuard.value = settings.throttleDropoutGuardMs;
    }
    if (typeof settings.lockGamepad === "boolean") {
      state.lockGamepad = settings.lockGamepad;
      els.lockGamepad.checked = settings.lockGamepad;
    }
    if (typeof settings.autoStart === "boolean") {
      state.autoStart = settings.autoStart;
      els.autoStart.checked = settings.autoStart;
    }
    if (settings.selectedGamepadId) {
      state.selectedGamepadId = settings.selectedGamepadId;
    }

    bridge.PEDAL_ORDER.forEach((key) => {
      const mapping = settings.mappings[key];
      const control = controls[key];
      if (!mapping) return;

      if (Number.isFinite(mapping.axis)) control.axis.value = String(mapping.axis);
      if (Number.isFinite(mapping.min)) control.min.value = mapping.min;
      if (Number.isFinite(mapping.max)) control.max.value = mapping.max;
      if (typeof mapping.invert === "boolean") control.invert.checked = mapping.invert;
    });

    persistCurrentSettings();
    drawCurvePreview();
    tick();
    return true;
  }

  function resetDefaultSettings() {
    els.pedalProfile.value = "linear";
    setCustomCurve(bridge.GT7_THROTTLE_OUTPUT);
    els.rate.value = "50";
    els.deadzone.value = "0";
    els.clutchDropoutGuard.value = "80";
    els.brakeDropoutGuard.value = "80";
    els.throttleDropoutGuard.value = "80";
    els.lockGamepad.checked = true;
    els.autoStart.checked = true;
    state.lockGamepad = true;
    state.autoStart = true;

    bridge.PEDAL_ORDER.forEach((key) => {
      const control = controls[key];
      control.axis.value = String(control.defaultAxis);
      control.min.value = "-1";
      control.max.value = "1";
      control.invert.checked = false;
    });

    persistCurrentSettings();
    drawCurvePreview();
    tick();
  }

  function migrateDefaultMappings() {
    if (localStorage.getItem(`${bridge.STORAGE_PREFIX}mappingVersion`) === bridge.DEFAULT_MAPPING_VERSION) {
      return;
    }

    bridge.PEDAL_ORDER.forEach((key) => {
      localStorage.setItem(`${bridge.STORAGE_PREFIX}${key}.axis`, String(controls[key].defaultAxis));
    });
    localStorage.setItem(`${bridge.STORAGE_PREFIX}mappingVersion`, bridge.DEFAULT_MAPPING_VERSION);
  }

  function loadSavedSettings() {
    migrateDefaultMappings();
    els.lockGamepad.checked = state.lockGamepad;
    els.autoStart.checked = state.autoStart;
    els.pedalProfile.value = localStorage.getItem(`${bridge.STORAGE_PREFIX}pedalProfile`) || els.pedalProfile.value;
    setCustomCurve(loadStoredCustomCurve());
    els.rate.value = localStorage.getItem(`${bridge.STORAGE_PREFIX}rate`) || els.rate.value;

    const savedDeadzone = localStorage.getItem(`${bridge.STORAGE_PREFIX}deadzone`);
    els.deadzone.value = savedDeadzone === "2" || savedDeadzone === null ? "0" : savedDeadzone;
    localStorage.setItem(`${bridge.STORAGE_PREFIX}deadzone`, els.deadzone.value);
    els.clutchDropoutGuard.value = localStorage.getItem(`${bridge.STORAGE_PREFIX}clutchDropoutGuard`) || els.clutchDropoutGuard.value;
    els.brakeDropoutGuard.value = localStorage.getItem(`${bridge.STORAGE_PREFIX}brakeDropoutGuard`) || els.brakeDropoutGuard.value;
    els.throttleDropoutGuard.value = localStorage.getItem(`${bridge.STORAGE_PREFIX}throttleDropoutGuard`) || els.throttleDropoutGuard.value;

    bridge.PEDAL_ORDER.forEach((key) => {
      const control = controls[key];
      const axis = localStorage.getItem(`${bridge.STORAGE_PREFIX}${key}.axis`);
      const min = localStorage.getItem(`${bridge.STORAGE_PREFIX}${key}.min`);
      const max = localStorage.getItem(`${bridge.STORAGE_PREFIX}${key}.max`);
      const invert = localStorage.getItem(`${bridge.STORAGE_PREFIX}${key}.invert`);

      if (axis !== null) control.axis.value = axis;
      if (min !== null) control.min.value = min;
      if (max !== null) control.max.value = max;
      if (invert !== null) control.invert.checked = invert === "true";
    });
  }

  function savePedalSettings(control) {
    localStorage.setItem(`${bridge.STORAGE_PREFIX}${control.key}.axis`, control.axis.value);
    localStorage.setItem(`${bridge.STORAGE_PREFIX}${control.key}.min`, control.min.value);
    localStorage.setItem(`${bridge.STORAGE_PREFIX}${control.key}.max`, control.max.value);
    localStorage.setItem(`${bridge.STORAGE_PREFIX}${control.key}.invert`, String(control.invert.checked));
  }

  function currentCustomCurve() {
    return [
      bridge.clampPct(Number(els.curve0.value)),
      bridge.clampPct(Number(els.curve25.value)),
      bridge.clampPct(Number(els.curve50.value)),
      bridge.clampPct(Number(els.curve75.value)),
      bridge.clampPct(Number(els.curve100.value))
    ];
  }

  function currentDropoutGuards() {
    return {
      clutch: Number(els.clutchDropoutGuard.value),
      brake: Number(els.brakeDropoutGuard.value),
      throttle: Number(els.throttleDropoutGuard.value)
    };
  }

  function loadStoredCustomCurve() {
    try {
      const parsed = JSON.parse(localStorage.getItem(`${bridge.STORAGE_PREFIX}customCurve`) || "null");
      return Array.isArray(parsed) ? parsed : bridge.GT7_THROTTLE_OUTPUT;
    } catch (_) {
      return bridge.GT7_THROTTLE_OUTPUT;
    }
  }

  function setCustomCurve(points) {
    const fallback = bridge.GT7_THROTTLE_OUTPUT;
    const values = [0, 1, 2, 3, 4].map((index) => bridge.clampPct(Number(points[index] ?? fallback[index])));
    els.curve0.value = values[0];
    els.curve25.value = values[1];
    els.curve50.value = values[2];
    els.curve75.value = values[3];
    els.curve100.value = values[4];
  }

  function saveCustomCurve() {
    localStorage.setItem(`${bridge.STORAGE_PREFIX}customCurve`, JSON.stringify(currentCustomCurve()));
    drawCurvePreview();
    tick();
  }

  function namedPresetStorageKey() {
    return `${bridge.STORAGE_PREFIX}namedPresets`;
  }

  function refreshPresetSelect(selectedName = "") {
    const presets = bridge.namedPresets(namedPresetStorageKey());
    const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
    els.presetSelect.textContent = "";

    if (names.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No presets";
      els.presetSelect.append(option);
      els.loadPreset.disabled = true;
      els.deletePreset.disabled = true;
      return;
    }

    names.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      els.presetSelect.append(option);
    });
    els.presetSelect.value = names.includes(selectedName) ? selectedName : names[0];
    els.presetName.value = els.presetSelect.value;
    els.loadPreset.disabled = false;
    els.deletePreset.disabled = false;
  }

  function getGamepads() {
    return Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(Boolean);
  }

  function preferredGamepad(pads) {
    if (pads.length === 0) return null;

    if (state.lockGamepad && state.selectedGamepadId) {
      const saved = pads.find((pad) => pad.id === state.selectedGamepadId);
      return saved || null;
    }

    const selectedIndex = Number(els.gamepadSelect.value);
    const selected = pads.find((pad) => pad.index === selectedIndex);
    if (selected) return selected;

    const simRuito = pads.find((pad) => /sim|ruito|pedal|wheel|joystick|usb/i.test(pad.id));
    if (simRuito) return simRuito;

    return pads.find((pad) => !/xbox/i.test(pad.id)) || pads[0];
  }

  function selectedGamepad() {
    return preferredGamepad(getGamepads());
  }

  function saveSelectedGamepad() {
    const pad = selectedGamepad();
    if (!pad) return;

    state.selectedGamepadId = pad.id;
    localStorage.setItem(`${bridge.STORAGE_PREFIX}selectedGamepadId`, pad.id);
    detailedLogger.record("gamepad_locked", {
      id: pad.id,
      index: pad.index
    }, true);
  }

  function rebuildAxisOptions(axisCount) {
    const optionCount = Math.max(4, axisCount || 0);

    bridge.PEDAL_ORDER.forEach((key) => {
      const control = controls[key];
      const savedAxis = localStorage.getItem(`${bridge.STORAGE_PREFIX}${key}.axis`);
      const current = control.axis.value || savedAxis || String(control.defaultAxis);
      control.axis.textContent = "";

      for (let index = 0; index < optionCount; index++) {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = `Axis ${index}`;
        control.axis.append(option);
      }

      control.axis.value = Number(current) < optionCount ? current : String(control.defaultAxis);
    });
  }

  function refreshGamepads() {
    const pads = getGamepads();
    const preferred = preferredGamepad(pads);
    els.gamepadSelect.textContent = "";

    pads.forEach((pad) => {
      const option = document.createElement("option");
      option.value = String(pad.index);
      option.textContent = `${pad.index}: ${pad.id}`;
      els.gamepadSelect.append(option);
    });

    if (pads.length === 0 || !preferred) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = pads.length === 0 ? "No gamepad detected" : "Locked gamepad not detected";
      els.gamepadSelect.prepend(option);
      els.gamepadSelect.value = "";
      rebuildAxisOptions(4);
      setPill(els.gamepadStatus, pads.length === 0 ? "Gamepad disconnected" : "Locked gamepad missing", false);
      detailedLogger.record("gamepad_refresh", {
        selectedIndex: null,
        pads: pads.map((pad) => ({
          id: pad.id,
          index: pad.index,
          axes: pad.axes.length,
          buttons: pad.buttons.length
        }))
      });
    } else {
      els.gamepadSelect.value = String(preferred.index);
      rebuildAxisOptions(preferred.axes.length);
      setPill(els.gamepadStatus, "Gamepad connected", true);
      detailedLogger.record("gamepad_refresh", {
        selectedIndex: preferred.index,
        pads: pads.map((pad) => ({
          id: pad.id,
          index: pad.index,
          axes: pad.axes.length,
          buttons: pad.buttons.length
        }))
      });
      if (!state.selectedGamepadId) {
        saveSelectedGamepad();
      }
    }

    updateButtons();
    maybeAutoStart();
  }

  function pedalSample(pad, control) {
    const axisIndex = Number(control.axis.value);
    const raw = pad && Number.isFinite(pad.axes[axisIndex]) ? pad.axes[axisIndex] : 0;
    const min = Number(control.min.value);
    const max = Number(control.max.value);
    let pct = max === min ? 0 : ((raw - min) * 100) / (max - min);
    if (control.invert.checked) pct = 100 - pct;

    return {
      axis: axisIndex,
      raw,
      min,
      max,
      invert: control.invert.checked,
      pct: bridge.clampPct(pct)
    };
  }

  function applyDeadzone(pct) {
    const deadzone = Math.max(0, Math.min(10, Number(els.deadzone.value) || 0));
    return pct <= deadzone ? 0 : pct;
  }

  function filterPedalPct(key, pct) {
    pct = applyDeadzone(pct);

    const now = performance.now();
    const guards = currentDropoutGuards();
    const guardMs = Math.max(0, Math.min(250, Number(guards[key]) || 0));
    const previous = state.lastPct[key];

    if (guardMs > 0 && previous >= 95 && pct === 0) {
      if (state.dropStart[key] === 0) {
        state.dropStart[key] = now;
        telemetry.markGuardedDrop(key);
      }
      if ((now - state.dropStart[key]) < guardMs) {
        return previous;
      }
    } else {
      state.dropStart[key] = 0;
    }

    state.lastPct[key] = pct;
    return pct;
  }

  function setPedal(control, pct) {
    control.fill.style.width = `${pct}%`;
    control.value.textContent = `${pct}%`;
  }

  function updateAxes(pad) {
    els.axisGrid.textContent = "";
    const axes = pad ? pad.axes : [];

    axes.forEach((raw, index) => {
      const pct = bridge.clampPct(((raw + 1) / 2) * 100);
      const item = document.createElement("div");
      item.className = "axis";

      const head = document.createElement("div");
      head.className = "axis-head";
      head.innerHTML = `<strong>Axis ${index}</strong><span>${raw.toFixed(4)}</span>`;

      const bar = document.createElement("div");
      bar.className = "bar";
      const fill = document.createElement("div");
      fill.className = "fill";
      fill.style.width = `${pct}%`;
      bar.append(fill);

      item.append(head, bar);
      els.axisGrid.append(item);
    });
  }

  function drawCurvePreview() {
    const canvas = els.curvePreview;
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const pad = 18;
    const plotWidth = width - pad * 2;
    const plotHeight = height - pad * 2;

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#10171a";
    context.fillRect(0, 0, width, height);

    context.strokeStyle = "rgba(149, 163, 170, 0.22)";
    context.lineWidth = 1;
    for (let step = 0; step <= 4; step++) {
      const x = pad + (plotWidth * step) / 4;
      const y = pad + (plotHeight * step) / 4;
      context.beginPath();
      context.moveTo(x, pad);
      context.lineTo(x, height - pad);
      context.stroke();
      context.beginPath();
      context.moveTo(pad, y);
      context.lineTo(width - pad, y);
      context.stroke();
    }

    context.strokeStyle = "rgba(149, 163, 170, 0.75)";
    context.beginPath();
    context.moveTo(pad, height - pad);
    context.lineTo(width - pad, pad);
    context.stroke();

    context.strokeStyle = els.pedalProfile.value === "gt7" ? "#f0c241" : "#10b5a5";
    context.lineWidth = 3;
    context.beginPath();
    for (let input = 0; input <= 100; input += 2) {
      const output = bridge.applyPedalProfile(els.pedalProfile.value, "throttle", input, currentCustomCurve());
      const x = pad + (input / 100) * plotWidth;
      const y = height - pad - (output / 100) * plotHeight;
      if (input === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();

    context.fillStyle = "#95a3aa";
    context.font = "700 11px system-ui, sans-serif";
    context.fillText("0", pad - 4, height - 5);
    context.fillText("100", width - pad - 18, height - 5);
    context.fillText("out", 5, pad + 4);
  }

  function captureAxisLimit(key, limit) {
    const pad = selectedGamepad();
    if (!pad) {
      writeStatus("No gamepad available for axis capture.");
      return;
    }

    const control = controls[key];
    const rounded = readAxisValue(pad, control);
    if (limit === "min") control.min.value = rounded;
    else control.max.value = rounded;
    savePedalSettings(control);
    writeStatus(`${bridge.PEDAL_DEFAULTS[key].label} ${limit} captured: ${rounded}`);
    detailedLogger.record("axis_limit_captured", {
      pedal: key,
      limit,
      axis: Number(control.axis.value),
      raw: rounded
    }, true);
    tick();
  }

  function readAxisValue(pad, control) {
    const axisIndex = Number(control.axis.value);
    const raw = Number.isFinite(pad.axes[axisIndex]) ? pad.axes[axisIndex] : 0;
    return Math.round(raw * 1000000) / 1000000;
  }

  function captureAllAxisLimits(limit) {
    const pad = selectedGamepad();
    if (!pad) {
      writeStatus("No gamepad available for axis capture.");
      return;
    }

    bridge.PEDAL_ORDER.forEach((key) => {
      const control = controls[key];
      const rounded = readAxisValue(pad, control);
      if (limit === "min") control.min.value = rounded;
      else control.max.value = rounded;
      savePedalSettings(control);
    });
    writeStatus(`All ${limit} values captured.`);
    detailedLogger.record("axis_limits_captured", {
      limit,
      settings: currentSettings()
    }, true);
    tick();
  }

  function startCalibration() {
    state.calibration.active = true;
    state.calibration.draft = {};
    renderCalibration();
    detailedLogger.record("calibration_started", {}, true);
  }

  function resetCalibration() {
    state.calibration.active = false;
    state.calibration.draft = {};
    renderCalibration();
    detailedLogger.record("calibration_reset", {}, true);
  }

  function captureCalibration(limit) {
    const pad = selectedGamepad();
    if (!pad) {
      els.calibrationStatus.textContent = "No gamepad.";
      return;
    }

    if (!state.calibration.active) {
      state.calibration.active = true;
    }

    bridge.PEDAL_ORDER.forEach((key) => {
      const control = controls[key];
      state.calibration.draft[key] = state.calibration.draft[key] || {};
      state.calibration.draft[key][limit] = readAxisValue(pad, control);
    });

    renderCalibration();
    detailedLogger.record("calibration_capture", {
      limit,
      draft: state.calibration.draft
    }, true);
  }

  function applyCalibration() {
    if (!calibrationReady()) {
      els.calibrationStatus.textContent = "Calibration incomplete.";
      return;
    }

    bridge.PEDAL_ORDER.forEach((key) => {
      const control = controls[key];
      control.min.value = state.calibration.draft[key].min;
      control.max.value = state.calibration.draft[key].max;
      savePedalSettings(control);
    });

    state.calibration.active = false;
    renderCalibration();
    writeStatus("Calibration applied.");
    detailedLogger.record("calibration_applied", {
      settings: currentSettings()
    }, true);
    tick();
  }

  function calibrationReady() {
    return bridge.PEDAL_ORDER.every((key) => (
      state.calibration.draft[key] &&
      Number.isFinite(state.calibration.draft[key].min) &&
      Number.isFinite(state.calibration.draft[key].max)
    ));
  }

  function renderCalibration() {
    const hasMin = bridge.PEDAL_ORDER.every((key) => state.calibration.draft[key] && Number.isFinite(state.calibration.draft[key].min));
    const hasMax = bridge.PEDAL_ORDER.every((key) => state.calibration.draft[key] && Number.isFinite(state.calibration.draft[key].max));
    const ready = calibrationReady();

    els.calStepMin.classList.toggle("done", hasMin);
    els.calStepMin.classList.toggle("active", state.calibration.active && !hasMin);
    els.calStepMax.classList.toggle("done", hasMax);
    els.calStepMax.classList.toggle("active", state.calibration.active && hasMin && !hasMax);
    els.calStepApply.classList.toggle("done", ready);
    els.calStepApply.classList.toggle("active", state.calibration.active && ready);

    els.resetCalibration.disabled = !state.calibration.active && !hasMin && !hasMax;
    els.captureCalibrationMin.disabled = !selectedGamepad();
    els.captureCalibrationMax.disabled = !selectedGamepad();
    els.applyCalibration.disabled = !ready;

    if (!state.calibration.active && !hasMin && !hasMax) {
      els.calibrationStatus.textContent = "Idle.";
    } else if (ready) {
      els.calibrationStatus.textContent = "Ready to apply.";
    } else if (hasMin) {
      els.calibrationStatus.textContent = "Released captured.";
    } else if (state.calibration.active) {
      els.calibrationStatus.textContent = "Capturing.";
    } else {
      els.calibrationStatus.textContent = "Draft available.";
    }
  }

  async function startSerialReader(port) {
    if (!port.readable) return;

    while (state.port === port && port.readable) {
      const reader = port.readable.getReader();
      state.reader = reader;

      try {
        while (state.port === port) {
          const result = await reader.read();
          if (result.done) break;
          if (result.value) {
            handleSerialText(decoder.decode(result.value, { stream: true }));
          }
        }
      } catch (error) {
        if (state.port === port) {
          writeStatus(`Serial read error: ${error.message}`);
          detailedLogger.record("serial_read_error", { message: error.message });
        }
      } finally {
        try {
          reader.releaseLock();
        } catch (_) {
          // Reader can already be released during manual disconnect.
        }
        if (state.reader === reader) {
          state.reader = null;
        }
      }
    }
  }

  function handleSerialText(text) {
    state.serialRxBuffer += text;
    const lines = state.serialRxBuffer.split(/\r?\n/);
    state.serialRxBuffer = lines.pop() || "";

    lines.forEach((line) => {
      if (!line) return;
      writeStatus(`Arduino: ${line}`);
      detailedLogger.record("serial_rx", { line });
    });
  }

  async function openSerialPort(port, message) {
    try {
      await port.open({ baudRate: bridge.SERIAL_BAUD_RATE });
      state.port = port;
      state.writer = port.writable.getWriter();
      startSerialReader(port);
      setPill(els.serialStatus, "Serial connected", true);
      writeStatus(message || `Serial connected at ${bridge.SERIAL_BAUD_RATE}.`);
      detailedLogger.record("serial_opened", {
        message: message || `Serial connected at ${bridge.SERIAL_BAUD_RATE}.`
      });
      updateButtons();
      await sendRestKeepalive("serial_opened");
      maybeAutoStart();
    } catch (error) {
      try {
        if (port && port.readable !== null) {
          await port.close();
        }
      } catch (_) {
        // Ignore cleanup errors; the UI state below is the important part.
      }
      state.port = null;
      state.writer = null;
      setPill(els.serialStatus, "Serial disconnected", false);
      updateButtons();
      throw error;
    }
  }

  async function connectSerial() {
    if (!("serial" in navigator)) {
      writeStatus("Web Serial is unavailable. Use Chrome or Edge.");
      return;
    }

    if (state.writer || state.port) {
      await disconnectSerial();
      return;
    }

    const port = await navigator.serial.requestPort();
    await openSerialPort(port, `Serial connected at ${bridge.SERIAL_BAUD_RATE}.`);
  }

  async function disconnectSerial() {
    stopBridge();

    const reader = state.reader;
    const writer = state.writer;
    const port = state.port;
    state.reader = null;
    state.writer = null;
    state.port = null;

    try {
      if (reader) {
        await reader.cancel();
        try {
          reader.releaseLock();
        } catch (_) {
          // The reader loop may already have released it.
        }
      }
      if (writer) {
        writer.releaseLock();
      }
      if (port && port.readable !== null) {
        await port.close();
      }
    } catch (error) {
      writeStatus(`Serial disconnect warning: ${error.message}`);
    }

    setPill(els.serialStatus, "Serial disconnected", false);
    detailedLogger.record("serial_closed", {}, true);
    updateButtons();
  }

  async function reconnectGrantedSerial() {
    if (!("serial" in navigator) || state.writer) return;

    const ports = await navigator.serial.getPorts();
    if (ports.length === 0) return;

    await openSerialPort(ports[0], `Serial reconnected at ${bridge.SERIAL_BAUD_RATE}.`);
  }

  async function sendLine(line) {
    if (!state.writer) return;
    await state.writer.write(encoder.encode(line));
    telemetry.markTx(line);
  }

  async function sendRestKeepalive(reason) {
    if (!state.writer) return;

    const now = performance.now();
    if (now < state.manualHoldUntil) return;
    if (state.lastLine === bridge.REST_LINE && (now - state.lastSend) < bridge.SERIAL_HEARTBEAT_MS) return;

    await sendLine(bridge.REST_LINE);
    state.lastLine = bridge.REST_LINE;
    state.lastSend = now;
    detailedLogger.record("serial_keepalive", {
      reason,
      outputLine: bridge.REST_LINE.trim()
    });
  }

  async function sendManualLine(line, label) {
    if (!state.writer) {
      writeStatus("Serial is not connected.");
      return;
    }

    stopBridge();
    await sendLine(line);
    state.lastLine = line;
    state.lastSend = performance.now();
    state.manualHoldUntil = line === bridge.REST_LINE ? 0 : state.lastSend + 3000;
    writeStatus(`Manual send: ${label} (${line.trim()})`);
    detailedLogger.record("manual_serial_tx", {
      label,
      outputLine: line.trim()
    }, true);
  }

  async function tick() {
    if (!state.running) {
      try {
        await sendRestKeepalive("bridge_stopped");
      } catch (error) {
        setPill(els.serialStatus, "Serial disconnected", false);
        writeStatus(error.message);
        detailedLogger.record("serial_write_error", { message: error.message });
      }
    }

    const pad = selectedGamepad();
    if (!pad) {
      detailedLogger.record("sample_no_gamepad", {
        running: state.running,
        serialConnected: Boolean(state.writer)
      });
      setPill(els.gamepadStatus, "Gamepad disconnected", false);
      bridge.PEDAL_ORDER.forEach((key) => setPedal(controls[key], 0));
      updateAxes(null);
      updateButtons();
      telemetry.render();
      updateHealth(null);
      return;
    }

    if (state.lockGamepad && state.selectedGamepadId && pad.id !== state.selectedGamepadId) {
      detailedLogger.record("wrong_gamepad_selected", {
        expectedId: state.selectedGamepadId,
        actual: { id: pad.id, index: pad.index }
      });
      refreshGamepads();
      return;
    }

    setPill(els.gamepadStatus, "Gamepad connected", true);
    updateAxes(pad);

    const samples = {};
    const filtered = {};
    const output = {};

    bridge.PEDAL_ORDER.forEach((key) => {
      samples[key] = pedalSample(pad, controls[key]);
      filtered[key] = filterPedalPct(key, samples[key].pct);
      output[key] = bridge.applyPedalProfile(els.pedalProfile.value, key, filtered[key], currentCustomCurve());
      setPedal(controls[key], output[key]);
    });
    telemetry.markSample(output);

    const line = `${output.clutch},${output.brake},${output.throttle}\n`;
    const now = performance.now();
    const shouldSend = state.running && state.writer && (line !== state.lastLine || now - state.lastSend >= bridge.SERIAL_HEARTBEAT_MS);
    let sent = false;
    let sendReason = "none";

    if (shouldSend) {
      sendReason = line !== state.lastLine ? "changed" : "heartbeat";
      state.lastLine = line;
      state.lastSend = now;
      try {
        await sendLine(line);
        sent = true;
        els.sendStatus.textContent = `Sending ${line.trim()}`;
      } catch (error) {
        stopBridge();
        setPill(els.serialStatus, "Serial disconnected", false);
        writeStatus(error.message);
        detailedLogger.record("serial_write_error", { message: error.message });
      }
    }

    detailedLogger.record("sample", {
      running: state.running,
      serialConnected: Boolean(state.writer),
      gamepad: {
        id: pad.id,
        index: pad.index,
        timestamp: pad.timestamp,
        connected: pad.connected
      },
      axes: pad.axes.map((value) => Math.round(value * 1000000) / 1000000),
      buttons: pad.buttons.map((button) => ({
        pressed: button.pressed,
        touched: button.touched,
        value: Math.round(button.value * 1000000) / 1000000
      })),
      pedals: {
        clutch: { ...samples.clutch, filteredPct: filtered.clutch, outputPct: output.clutch },
        brake: { ...samples.brake, filteredPct: filtered.brake, outputPct: output.brake },
        throttle: { ...samples.throttle, filteredPct: filtered.throttle, outputPct: output.throttle }
      },
      outputLine: line.trim(),
      sent,
      sendReason,
      settings: {
        pedalProfile: els.pedalProfile.value,
        deadzonePct: Number(els.deadzone.value),
        dropoutGuardMs: currentDropoutGuards(),
        throttleDropoutGuardMs: Number(els.throttleDropoutGuard.value)
      }
    });
    telemetry.render();
    updateHealth(pad, output);
  }

  function updateHealth(pad, output = null) {
    health.update({
      running: state.running,
      serialConnected: Boolean(state.writer),
      hasGamepad: Boolean(pad),
      lockGamepad: state.lockGamepad,
      selectedGamepadId: state.selectedGamepadId,
      lastSendAgeMs: state.lastSend ? performance.now() - state.lastSend : 0,
      guardCount: telemetry.state.guardCount,
      guardByPedal: telemetry.state.guardByPedal,
      dropoutGuardMs: currentDropoutGuards(),
      txRateHz: telemetry.state.txWindow.length,
      configuredRateHz: Number(els.rate.value) || 0,
      deadzonePct: Number(els.deadzone.value) || 0,
      customCurve: els.pedalProfile.value === "custom" ? currentCustomCurve() : null,
      output
    });
  }

  function applyRecommendationAction(action) {
    if (!action || !action.type) return;

    if (action.type === "stop_bridge") {
      stopBridge();
      writeStatus("Recommendation applied: bridge stopped.");
    }

    if (action.type === "refresh_gamepads") {
      refreshGamepads();
      writeStatus("Recommendation applied: gamepads refreshed.");
    }

    if (action.type === "set_rate") {
      els.rate.value = String(action.value);
      localStorage.setItem(`${bridge.STORAGE_PREFIX}rate`, els.rate.value);
      if (state.running) startBridge();
      writeStatus(`Recommendation applied: send rate ${action.value} Hz.`);
    }

    if (action.type === "set_deadzone") {
      els.deadzone.value = String(action.value);
      localStorage.setItem(`${bridge.STORAGE_PREFIX}deadzone`, els.deadzone.value);
      tick();
      writeStatus(`Recommendation applied: deadzone ${action.value}%.`);
    }

    if (action.type === "set_guard") {
      const guardInput = {
        clutch: els.clutchDropoutGuard,
        brake: els.brakeDropoutGuard,
        throttle: els.throttleDropoutGuard
      }[action.pedal];

      if (guardInput) {
        guardInput.value = String(action.value);
        localStorage.setItem(`${bridge.STORAGE_PREFIX}${action.pedal}DropoutGuard`, guardInput.value);
        tick();
        writeStatus(`Recommendation applied: ${action.pedal} guard ${action.value} ms.`);
      }
    }

    if (action.type === "fix_curve") {
      const fixed = monotonicCurve(currentCustomCurve());
      setCustomCurve(fixed);
      saveCustomCurve();
      writeStatus("Recommendation applied: custom curve fixed.");
    }

    detailedLogger.record("recommendation_applied", {
      action,
      settings: currentSettings()
    }, true);
  }

  function monotonicCurve(points) {
    let highest = 0;
    return points.map((point) => {
      highest = Math.max(highest, bridge.clampPct(Number(point)));
      return highest;
    });
  }

  function startBridge() {
    state.running = true;
    const rate = Math.max(10, Math.min(120, Number(els.rate.value) || 50));
    window.clearInterval(state.timer);
    state.timer = window.setInterval(tick, 1000 / rate);
    setPill(els.sendStatus, "Running", true);
    detailedLogger.record("bridge_started", { settings: currentSettings() });
    updateButtons();
  }

  function maybeAutoStart() {
    if (state.autoStart && !state.running && state.writer && selectedGamepad()) {
      startBridge();
    }
  }

  function stopBridge() {
    state.running = false;
    window.clearInterval(state.timer);
    state.timer = window.setInterval(tick, 120);
    els.sendStatus.classList.remove("ok", "warn");
    els.sendStatus.textContent = "Stopped";
    detailedLogger.record("bridge_stopped", { settings: currentSettings() });
    updateButtons();
  }

  function updateButtons() {
    const hasPad = Boolean(selectedGamepad());
    const hasSerial = Boolean(state.writer);
    els.connectSerial.textContent = hasSerial ? "Disconnect Serial" : "Connect Serial";
    els.startBridge.disabled = state.running || !hasPad || !hasSerial;
    els.stopBridge.disabled = !state.running;
    els.connectSerial.disabled = false;
    els.testThrottle.disabled = !hasSerial;
    els.testRest.disabled = !hasSerial;
    renderCalibration();
  }

  function bindEvents() {
    els.refreshGamepads.addEventListener("click", refreshGamepads);
    els.connectSerial.addEventListener("click", () => connectSerial().catch((error) => writeStatus(error.message)));
    els.testThrottle.addEventListener("click", () => sendManualLine("0,0,50\n", "throttle 50%").catch((error) => writeStatus(error.message)));
    els.testRest.addEventListener("click", () => sendManualLine(bridge.REST_LINE, "rest").catch((error) => writeStatus(error.message)));
    els.startBridge.addEventListener("click", startBridge);
    els.stopBridge.addEventListener("click", stopBridge);

    els.pedalProfile.addEventListener("change", () => {
      localStorage.setItem(`${bridge.STORAGE_PREFIX}pedalProfile`, els.pedalProfile.value);
      detailedLogger.record("profile_changed", { pedalProfile: els.pedalProfile.value }, true);
      drawCurvePreview();
      tick();
    });
    [els.curve0, els.curve25, els.curve50, els.curve75, els.curve100].forEach((input) => {
      input.addEventListener("change", saveCustomCurve);
    });
    els.resetCurve.addEventListener("click", () => {
      setCustomCurve(bridge.GT7_THROTTLE_OUTPUT);
      saveCustomCurve();
      writeStatus("Custom curve reset.");
    });

    els.startLog.addEventListener("click", () => {
      if (detailedLogger.state.enabled) {
        detailedLogger.stop().catch((error) => writeStatus(error.message));
      } else {
        detailedLogger.start().catch((error) => writeStatus(error.message));
      }
    });
    els.detailedLog.addEventListener("change", () => {
      if (els.detailedLog.checked && !detailedLogger.state.enabled) {
        detailedLogger.start().catch((error) => writeStatus(error.message));
      } else if (!els.detailedLog.checked && detailedLogger.state.enabled) {
        detailedLogger.stop().catch((error) => writeStatus(error.message));
      }
    });
    els.downloadLog.addEventListener("click", detailedLogger.download);
    els.clearLog.addEventListener("click", detailedLogger.clear);
    els.markLog.addEventListener("click", () => detailedLogger.record("manual_mark", {
      settings: currentSettings(),
      lastPct: state.lastPct,
      lastLine: state.lastLine.trim()
    }, true));

    els.rate.addEventListener("change", () => {
      localStorage.setItem(`${bridge.STORAGE_PREFIX}rate`, els.rate.value);
      if (state.running) startBridge();
    });
    els.deadzone.addEventListener("change", () => {
      localStorage.setItem(`${bridge.STORAGE_PREFIX}deadzone`, els.deadzone.value);
      tick();
    });
    els.clutchDropoutGuard.addEventListener("change", () => {
      localStorage.setItem(`${bridge.STORAGE_PREFIX}clutchDropoutGuard`, els.clutchDropoutGuard.value);
      tick();
    });
    els.brakeDropoutGuard.addEventListener("change", () => {
      localStorage.setItem(`${bridge.STORAGE_PREFIX}brakeDropoutGuard`, els.brakeDropoutGuard.value);
      tick();
    });
    els.throttleDropoutGuard.addEventListener("change", () => {
      localStorage.setItem(`${bridge.STORAGE_PREFIX}throttleDropoutGuard`, els.throttleDropoutGuard.value);
      tick();
    });
    els.autoStart.addEventListener("change", () => {
      state.autoStart = els.autoStart.checked;
      localStorage.setItem(`${bridge.STORAGE_PREFIX}autoStart`, String(state.autoStart));
      maybeAutoStart();
    });
    els.savePreset.addEventListener("click", () => {
      const name = els.presetName.value.trim() || "Default";
      bridge.saveNamedPreset(namedPresetStorageKey(), name, currentSettings());
      refreshPresetSelect(name);
      writeStatus(`Preset saved: ${name}.`);
      detailedLogger.record("preset_saved", { settings: currentSettings() }, true);
    });
    els.loadPreset.addEventListener("click", () => {
      const presets = bridge.namedPresets(namedPresetStorageKey());
      const preset = presets[els.presetSelect.value];
      if (!preset) {
        writeStatus("No saved preset found.");
        return;
      }
      applySettings(preset);
      writeStatus(`Preset loaded: ${els.presetSelect.value}.`);
      detailedLogger.record("preset_loaded", { settings: currentSettings() }, true);
    });
    els.deletePreset.addEventListener("click", () => {
      const name = els.presetSelect.value;
      if (!name) return;
      bridge.deleteNamedPreset(namedPresetStorageKey(), name);
      refreshPresetSelect();
      writeStatus(`Preset deleted: ${name}.`);
      detailedLogger.record("preset_deleted", { name }, true);
    });
    els.presetSelect.addEventListener("change", () => {
      els.presetName.value = els.presetSelect.value;
    });
    els.exportConfig.addEventListener("click", () => {
      bridge.downloadJson("gamepad_serial_bridge_config.json", currentSettings());
      detailedLogger.record("config_exported", { settings: currentSettings() }, true);
    });
    els.importConfig.addEventListener("click", () => els.configImportFile.click());
    els.configImportFile.addEventListener("change", () => {
      const file = els.configImportFile.files[0];
      if (!file) return;
      bridge.readJsonFile(file)
        .then((settings) => {
          if (!applySettings(settings)) {
            writeStatus("Invalid config file.");
            return;
          }
          writeStatus("Config imported.");
          detailedLogger.record("config_imported", { settings: currentSettings() }, true);
        })
        .catch((error) => writeStatus(`Import failed: ${error.message}`))
        .finally(() => {
          els.configImportFile.value = "";
        });
    });
    els.resetDefaults.addEventListener("click", () => {
      resetDefaultSettings();
      writeStatus("Defaults restored.");
      detailedLogger.record("defaults_restored", { settings: currentSettings() }, true);
    });
    els.gamepadSelect.addEventListener("change", () => {
      const selectedIndex = Number(els.gamepadSelect.value);
      const pad = getGamepads().find((gamepad) => gamepad.index === selectedIndex);
      if (pad) {
        state.selectedGamepadId = pad.id;
        localStorage.setItem(`${bridge.STORAGE_PREFIX}selectedGamepadId`, pad.id);
        detailedLogger.record("gamepad_locked", {
          id: pad.id,
          index: pad.index
        }, true);
      }
      rebuildAxisOptions(pad ? pad.axes.length : 4);
      updateButtons();
    });
    els.lockGamepad.addEventListener("change", () => {
      state.lockGamepad = els.lockGamepad.checked;
      localStorage.setItem(`${bridge.STORAGE_PREFIX}lockGamepad`, String(state.lockGamepad));
      if (state.lockGamepad) saveSelectedGamepad();
    });

    bridge.PEDAL_ORDER.forEach((key) => {
      const control = controls[key];
      [control.axis, control.min, control.max, control.invert].forEach((element) => {
        element.addEventListener("change", () => {
          savePedalSettings(control);
          tick();
        });
      });
    });

    bridge.PEDAL_ORDER.forEach((key) => {
      els[`${key}CaptureMin`].addEventListener("click", () => captureAxisLimit(key, "min"));
      els[`${key}CaptureMax`].addEventListener("click", () => captureAxisLimit(key, "max"));
    });
    els.captureAllMin.addEventListener("click", () => captureAllAxisLimits("min"));
    els.captureAllMax.addEventListener("click", () => captureAllAxisLimits("max"));
    els.startCalibration.addEventListener("click", startCalibration);
    els.resetCalibration.addEventListener("click", resetCalibration);
    els.captureCalibrationMin.addEventListener("click", () => captureCalibration("min"));
    els.captureCalibrationMax.addEventListener("click", () => captureCalibration("max"));
    els.applyCalibration.addEventListener("click", applyCalibration);

    window.addEventListener("gamepadconnected", refreshGamepads);
    window.addEventListener("gamepaddisconnected", refreshGamepads);
  }

  function init() {
    if (!("serial" in navigator)) {
      writeStatus("Open this page in Chrome or Edge with Web Serial support.");
    }

    bindEvents();
    loadSavedSettings();
    detailedLogger.updateButtons();
    refreshPresetSelect();
    renderCalibration();
    refreshGamepads();
    drawCurvePreview();
    stopBridge();
    reconnectGrantedSerial().catch((error) => writeStatus(error.message));
  }

  init();
})(window.PedalBridge = window.PedalBridge || {});
