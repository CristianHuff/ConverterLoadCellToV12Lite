(function (bridge) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const state = {
    port: null,
    writer: null,
    reader: null,
    serialWriteQueue: Promise.resolve(),
    serialRxBuffer: "",
    serialConfirmed: false,
    serialOpenedAt: 0,
    serialLastRx: 0,
    serialUnexpectedRx: "",
    serialProbeTimer: 0,
    serialProbeUntil: 0,
    serialProtocol: bridge.SERIAL_PROTOCOL_DEFAULT,
    localBridgeConnected: false,
    localBridgePollTimer: 0,
    localBridgeRxCount: 0,
    gamepadSignature: "",
    gamepadScanTimer: 0,
    running: false,
    lastLine: "",
    lastSend: 0,
    timer: 0,
    tickBusy: false,
    skippedTicks: 0,
    manualHoldUntil: 0,
    manualStreamTimer: 0,
    autoStartRetryTimer: 0,
    autoStartDeadline: 0,
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
    testClutch: document.querySelector("#testClutch"),
    testBrake: document.querySelector("#testBrake"),
    testThrottle: document.querySelector("#testThrottle"),
    testRest: document.querySelector("#testRest"),
    testSweep: document.querySelector("#testSweep"),
    startBridge: document.querySelector("#startBridge"),
    stopBridge: document.querySelector("#stopBridge"),
    serialTransport: document.querySelector("#serialTransport"),
    rate: document.querySelector("#rate"),
    txMode: document.querySelector("#txMode"),
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
    gamepadList: document.querySelector("#gamepadList"),
    curvePreview: document.querySelector("#curvePreview"),
    signalHistory: document.querySelector("#signalHistory"),
    txRate: document.querySelector("#txRate"),
    txCount: document.querySelector("#txCount"),
    guardCount: document.querySelector("#guardCount"),
    serialProtocol: document.querySelector("#serialProtocol"),
    lastLine: document.querySelector("#lastLine"),
    arduinoRx: document.querySelector("#arduinoRx"),
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

  function canSendPedals() {
    return isLocalBridgeTransport() ? state.localBridgeConnected : Boolean(state.writer);
  }

  function isLocalBridgeTransport() {
    return els.serialTransport.value === bridge.TRANSPORT_LOCAL_BRIDGE;
  }

  function updateSerialStatus() {
    if (els.serialProtocol) {
      els.serialProtocol.textContent = state.serialProtocol === bridge.SERIAL_PROTOCOL_LEGACY ? "legacy" : "current";
    }

    if (isLocalBridgeTransport()) {
      setPill(els.serialStatus, state.localBridgeConnected ? "Local bridge connected" : "Local bridge disconnected", state.localBridgeConnected);
      return;
    }

    if (!state.writer) {
      setPill(els.serialStatus, "Serial disconnected", false);
      return;
    }

    if (state.serialConfirmed) {
      setPill(els.serialStatus, "Arduino confirmed", true);
      return;
    }

    const age = state.serialOpenedAt ? performance.now() - state.serialOpenedAt : 0;
    const label = state.serialUnexpectedRx
      ? "Unexpected RX"
      : age < bridge.SERIAL_BOOT_GRACE_MS
        ? "Arduino booting"
      : age > bridge.SERIAL_CONFIRM_TIMEOUT_MS
        ? "No Arduino RX"
        : "Serial opening";
    setPill(els.serialStatus, label, false);
  }

  function cleanSerialLine(line) {
    return String(line || "")
      .replace(/[^\x20-\x7E]/g, "?")
      .trim();
  }

  function isBridgeSerialLine(line) {
    return /^(PONG serial_pedal_bridge|Serial pedal bridge ready\.|Send lines as: clutch,brake,throttle|Send lines as: brake,throttle,clutch|Pedal profiles are handled by the PC bridge\.|Serial pedal input active\.|Serial pedal input timeout\. Outputs at rest\.|Invalid pedal line: PING|Active pedal profile \d+: .+|RX ok packets:\d+ last:\d+,\d+,\d+)$/.test(line);
  }

  function detectSerialProtocol(line) {
    if (line === "Send lines as: brake,throttle,clutch" || line === "Invalid pedal line: PING") {
      state.serialProtocol = bridge.SERIAL_PROTOCOL_LEGACY;
      return;
    }

    if (line === "Send lines as: clutch,brake,throttle" || line === "PONG serial_pedal_bridge") {
      state.serialProtocol = bridge.SERIAL_PROTOCOL_CURRENT;
    }
  }

  function formatPedalLine(values) {
    const pct = {
      clutch: bridge.clampPct(Number(values.clutch) || 0),
      brake: bridge.clampPct(Number(values.brake) || 0),
      throttle: bridge.clampPct(Number(values.throttle) || 0)
    };

    if (state.serialProtocol === bridge.SERIAL_PROTOCOL_LEGACY) {
      return `${pct.brake},${pct.throttle},${pct.clutch}\n`;
    }

    return `${pct.clutch},${pct.brake},${pct.throttle}\n`;
  }

  function currentSettings() {
    return {
      schema: "gamepad-serial-bridge-settings-v1",
      serialTransport: els.serialTransport.value,
      rateHz: Number(els.rate.value),
      txMode: els.txMode.value,
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
    localStorage.setItem(`${bridge.STORAGE_PREFIX}serialTransport`, els.serialTransport.value);
    localStorage.setItem(`${bridge.STORAGE_PREFIX}rate`, els.rate.value);
    localStorage.setItem(`${bridge.STORAGE_PREFIX}txMode`, els.txMode.value);
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
    if (settings.serialTransport) els.serialTransport.value = settings.serialTransport;
    if (Number.isFinite(settings.rateHz)) els.rate.value = settings.rateHz;
    if (settings.txMode) els.txMode.value = settings.txMode;
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
    els.serialTransport.value = bridge.TRANSPORT_DEFAULT;
    els.rate.value = "50";
    els.txMode.value = bridge.TX_MODE_DEFAULT;
    els.deadzone.value = "0";
    els.clutchDropoutGuard.value = "0";
    els.brakeDropoutGuard.value = "0";
    els.throttleDropoutGuard.value = "0";
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
    els.serialTransport.value = localStorage.getItem(`${bridge.STORAGE_PREFIX}serialTransport`) || bridge.TRANSPORT_DEFAULT;
    els.rate.value = localStorage.getItem(`${bridge.STORAGE_PREFIX}rate`) || els.rate.value;
    els.txMode.value = localStorage.getItem(`${bridge.STORAGE_PREFIX}txMode`) || bridge.TX_MODE_DEFAULT;

    const savedDeadzone = localStorage.getItem(`${bridge.STORAGE_PREFIX}deadzone`);
    els.deadzone.value = savedDeadzone === "2" || savedDeadzone === null ? "0" : savedDeadzone;
    localStorage.setItem(`${bridge.STORAGE_PREFIX}deadzone`, els.deadzone.value);
    const savedClutchGuard = localStorage.getItem(`${bridge.STORAGE_PREFIX}clutchDropoutGuard`);
    const savedBrakeGuard = localStorage.getItem(`${bridge.STORAGE_PREFIX}brakeDropoutGuard`);
    const savedThrottleGuard = localStorage.getItem(`${bridge.STORAGE_PREFIX}throttleDropoutGuard`);
    els.clutchDropoutGuard.value = savedClutchGuard === null || savedClutchGuard === "80" ? "0" : savedClutchGuard;
    els.brakeDropoutGuard.value = savedBrakeGuard === null || savedBrakeGuard === "80" ? "0" : savedBrakeGuard;
    els.throttleDropoutGuard.value = savedThrottleGuard === null || savedThrottleGuard === "80" ? "0" : savedThrottleGuard;
    localStorage.setItem(`${bridge.STORAGE_PREFIX}clutchDropoutGuard`, els.clutchDropoutGuard.value);
    localStorage.setItem(`${bridge.STORAGE_PREFIX}brakeDropoutGuard`, els.brakeDropoutGuard.value);
    localStorage.setItem(`${bridge.STORAGE_PREFIX}throttleDropoutGuard`, els.throttleDropoutGuard.value);

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

  function isPedalGamepad(pad) {
    return Boolean(pad && bridge.PEDAL_GAMEPAD_PATTERN.test(pad.id));
  }

  function isRemoteGamepad(pad) {
    return Boolean(pad && bridge.REMOTE_GAMEPAD_PATTERN.test(pad.id) && !isPedalGamepad(pad));
  }

  function gamepadListSignature(pads) {
    return pads
      .map((pad) => `${pad.index}:${pad.id}:${pad.axes.length}:${pad.buttons.length}:${pad.connected}`)
      .join("|");
  }

  function preferredGamepad(pads) {
    if (pads.length === 0) return null;
    const pedalPads = pads.filter(isPedalGamepad);

    if (state.lockGamepad && state.selectedGamepadId) {
      const saved = pads.find((pad) => pad.id === state.selectedGamepadId);
      if (saved) return saved;

      const pedal = pedalPads[0];
      return pedal || null;
    }

    const selectedIndex = Number(els.gamepadSelect.value);
    const selected = pads.find((pad) => pad.index === selectedIndex);
    if (selected && isPedalGamepad(selected)) return selected;

    const simRuito = pedalPads[0];
    if (simRuito) return simRuito;

    return null;
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
    state.gamepadSignature = gamepadListSignature(pads);
    els.gamepadSelect.textContent = "";
    renderGamepadList(pads, preferred);

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
      if (state.lockGamepad && state.selectedGamepadId && preferred.id !== state.selectedGamepadId && isPedalGamepad(preferred)) {
        detailedLogger.record("gamepad_lock_recovered", {
          previousId: state.selectedGamepadId,
          recovered: {
            id: preferred.id,
            index: preferred.index
          }
        }, true);
        state.selectedGamepadId = preferred.id;
        localStorage.setItem(`${bridge.STORAGE_PREFIX}selectedGamepadId`, preferred.id);
      }

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

  function renderGamepadList(pads, preferred) {
    if (!els.gamepadList) return;

    els.gamepadList.textContent = "";
    if (pads.length === 0) {
      const empty = document.createElement("div");
      empty.className = "gamepad-item muted";
      empty.textContent = "No browser-visible gamepads.";
      els.gamepadList.append(empty);
      return;
    }

    pads.forEach((pad) => {
      const item = document.createElement("div");
      const classes = ["gamepad-item"];
      if (preferred && pad.index === preferred.index) classes.push("active");
      if (isPedalGamepad(pad)) classes.push("pedal-device");
      if (isRemoteGamepad(pad)) classes.push("remote-device");
      item.className = classes.join(" ");

      const title = document.createElement("strong");
      title.textContent = `${pad.index}: ${pad.id}`;

      const meta = document.createElement("span");
      const kind = isPedalGamepad(pad) ? "pedal candidate" : isRemoteGamepad(pad) ? "remote/controller ignored" : "visible, not auto-selected";
      meta.textContent = `${pad.axes.length} axes / ${pad.buttons.length} buttons - ${kind}`;

      item.append(title, meta);
      els.gamepadList.append(item);
    });
  }

  function startGamepadScanner() {
    window.clearInterval(state.gamepadScanTimer);
    state.gamepadScanTimer = window.setInterval(() => {
      const pads = getGamepads();
      const signature = gamepadListSignature(pads);
      if (signature !== state.gamepadSignature) {
        refreshGamepads();
      }
    }, 500);
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
      const cleanLine = cleanSerialLine(line);
      state.serialLastRx = performance.now();
      if (els.arduinoRx) {
        els.arduinoRx.textContent = cleanLine || "Unreadable serial data";
      }

      detectSerialProtocol(cleanLine);
      if (isBridgeSerialLine(cleanLine)) {
        state.serialConfirmed = true;
        state.serialUnexpectedRx = "";
      } else if (!state.serialConfirmed) {
        state.serialUnexpectedRx = cleanLine || "Unreadable serial data";
      }

      updateSerialStatus();
      updateButtons();
      maybeAutoStart();
      writeStatus(`${state.serialConfirmed ? "Arduino" : "Serial"}: ${cleanLine}`);
      detailedLogger.record(state.serialConfirmed ? "serial_rx" : "serial_rx_unrecognized", {
        line: cleanLine,
        rawLength: String(line).length
      });
    });
  }

  async function writeSerialRaw(line) {
    if (isLocalBridgeTransport()) {
      await writeLocalBridge(line);
      return;
    }

    const writer = state.writer;
    if (!writer) return;

    const data = encoder.encode(line);
    state.serialWriteQueue = state.serialWriteQueue
      .catch(() => {
        // Keep the queue alive after a failed write; the caller handles the error.
      })
      .then(async () => {
        if (state.writer !== writer) return;
        await writer.write(data);
      });

    await state.serialWriteQueue;
  }

  async function fetchLocalBridge(path, options = {}) {
    const response = await fetch(`${bridge.LOCAL_BRIDGE_URL}${path}`, {
      cache: "no-store",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `Local bridge HTTP ${response.status}`);
    }

    return payload;
  }

  function handleLocalBridgeStatus(payload) {
    if (!payload) return;

    state.localBridgeConnected = Boolean(payload.ok);
    const rxCount = Number(payload.rxCount) || 0;
    if (rxCount > state.localBridgeRxCount) {
      const newCount = rxCount - state.localBridgeRxCount;
      const rxLines = Array.isArray(payload.rxLines) ? payload.rxLines.slice(-newCount) : [];
      rxLines.forEach((line) => handleSerialText(`${line}\n`));
      if (rxLines.length === 0 && payload.rxLast) {
        handleSerialText(`${payload.rxLast}\n`);
      }
      state.localBridgeRxCount = rxCount;
    }
    updateSerialStatus();
    updateButtons();
  }

  async function writeLocalBridge(line) {
    if (!state.localBridgeConnected) return;

    const payload = await fetchLocalBridge("/send", {
      method: "POST",
      body: JSON.stringify({ line })
    });
    handleLocalBridgeStatus(payload);
  }

  function startLocalBridgePolling() {
    window.clearInterval(state.localBridgePollTimer);
    state.localBridgePollTimer = window.setInterval(() => {
      if (!state.localBridgeConnected || !isLocalBridgeTransport()) return;
      fetchLocalBridge("/status")
        .then(handleLocalBridgeStatus)
        .catch((error) => {
          state.localBridgeConnected = false;
          writeStatus(`Local bridge disconnected: ${error.message}`);
          updateSerialStatus();
          updateButtons();
        });
    }, 500);
  }

  function stopLocalBridgePolling() {
    window.clearInterval(state.localBridgePollTimer);
    state.localBridgePollTimer = 0;
  }

  async function sendSerialProbe(reason) {
    if (!state.writer) return;

    try {
      await writeSerialRaw(bridge.SERIAL_PING_LINE);
      detailedLogger.record("serial_probe", { reason }, reason !== "periodic");
    } catch (error) {
      stopBridge();
      state.serialConfirmed = false;
      updateSerialStatus();
      writeStatus(error.message);
      detailedLogger.record("serial_write_error", { message: error.message });
    }
  }

  function startSerialProbe() {
    window.clearInterval(state.serialProbeTimer);
    state.serialProbeTimer = window.setInterval(() => {
      if (!state.writer) return;
      if (state.running) {
        updateSerialStatus();
        updateHealth(selectedGamepad());
        return;
      }

      const now = performance.now();
      const rxAge = state.serialLastRx ? now - state.serialLastRx : Number.POSITIVE_INFINITY;
      const inBootProbeBurst = state.serialProbeUntil && now < state.serialProbeUntil;
      if (inBootProbeBurst || !state.serialConfirmed || rxAge > bridge.SERIAL_PROBE_MS * 8) {
        sendSerialProbe(inBootProbeBurst ? "boot_burst" : "periodic").catch((error) => writeStatus(error.message));
      }
      updateSerialStatus();
      updateHealth(selectedGamepad());
    }, bridge.SERIAL_PROBE_MS);
  }

  function stopSerialProbe() {
    window.clearInterval(state.serialProbeTimer);
    state.serialProbeTimer = 0;
  }

  async function openSerialPort(port, message) {
    try {
      await port.open({ baudRate: bridge.SERIAL_BAUD_RATE });
      state.port = port;
      state.writer = port.writable.getWriter();
      state.serialConfirmed = false;
      state.serialOpenedAt = performance.now();
      state.serialLastRx = 0;
      state.serialUnexpectedRx = "";
      state.serialRxBuffer = "";
      state.serialProtocol = bridge.SERIAL_PROTOCOL_DEFAULT;
      state.serialProbeUntil = state.serialOpenedAt + bridge.SERIAL_PROBE_BURST_MS;
      if (els.arduinoRx) {
        els.arduinoRx.textContent = "Waiting...";
      }
      startSerialReader(port);
      startSerialProbe();
      updateSerialStatus();
      writeStatus(message || `Serial connected at ${bridge.SERIAL_BAUD_RATE}.`);
      detailedLogger.record("serial_opened", {
        message: message || `Serial connected at ${bridge.SERIAL_BAUD_RATE}.`
      });
      updateButtons();
      window.setTimeout(() => {
        if (state.port !== port || !state.writer) return;
        sendSerialProbe("boot_delay").catch((error) => writeStatus(error.message));
        writeSerialRaw(bridge.REST_LINE).catch((error) => writeStatus(error.message));
      }, bridge.SERIAL_BOOT_GRACE_MS);
      detailedLogger.record("serial_wakeup", {
        outputLine: bridge.REST_LINE.trim(),
        delayMs: bridge.SERIAL_BOOT_GRACE_MS
      }, true);
      requestAutoStartRetry(20000);
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
      state.serialConfirmed = false;
      state.serialUnexpectedRx = "";
      stopSerialProbe();
      updateSerialStatus();
      updateButtons();
      throw error;
    }
  }

  async function connectSerial() {
    if (isLocalBridgeTransport()) {
      if (state.localBridgeConnected) {
        disconnectLocalBridge();
      } else {
        await connectLocalBridge();
      }
      return;
    }

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

  async function connectLocalBridge() {
    try {
      state.localBridgeRxCount = 0;
      const payload = await fetchLocalBridge("/status");
      state.localBridgeConnected = true;
      handleLocalBridgeStatus(payload);
      startLocalBridgePolling();
      writeStatus("Local COM bridge connected.");
      updateButtons();
      await sendSerialProbe("local_bridge_connect");
      await sendLine(bridge.REST_LINE);
      requestAutoStartRetry(20000);
    } catch (error) {
      state.localBridgeConnected = false;
      updateSerialStatus();
      updateButtons();
      writeStatus(`Local bridge unavailable: ${error.message}`);
    }
  }

  function disconnectLocalBridge() {
    state.localBridgeConnected = false;
    state.localBridgeRxCount = 0;
    stopLocalBridgePolling();
    updateSerialStatus();
    updateButtons();
    writeStatus("Local COM bridge disconnected.");
  }

  async function disconnectSerial() {
    if (isLocalBridgeTransport()) {
      disconnectLocalBridge();
      return;
    }

    stopBridge();

    const reader = state.reader;
    const writer = state.writer;
    const port = state.port;
    state.reader = null;
    state.writer = null;
    state.port = null;
    state.serialConfirmed = false;
    state.serialOpenedAt = 0;
    state.serialLastRx = 0;
    state.serialUnexpectedRx = "";
    state.serialProtocol = bridge.SERIAL_PROTOCOL_DEFAULT;
    state.serialProbeUntil = 0;
    stopSerialProbe();
    stopLocalBridgePolling();

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

    if (els.arduinoRx) {
      els.arduinoRx.textContent = "No data";
    }
    updateSerialStatus();
    detailedLogger.record("serial_closed", {}, true);
    updateButtons();
  }

  async function reconnectGrantedSerial() {
    if (isLocalBridgeTransport()) return;
    if (!("serial" in navigator) || state.writer) return;

    const ports = await navigator.serial.getPorts();
    if (ports.length === 0) return;

    await openSerialPort(ports[0], `Serial reconnected at ${bridge.SERIAL_BAUD_RATE}.`);
  }

  async function sendLine(line) {
    if (!canSendPedals()) return;
    await writeSerialRaw(line);
    telemetry.markTx(line);
  }

  async function sendManualCommand(command, label) {
    if (!canSendPedals()) {
      writeStatus("Serial is not connected.");
      return;
    }

    stopBridge();
    window.clearInterval(state.manualStreamTimer);
    const line = `${command}\n`;
    await sendLine(line);
    state.lastLine = line;
    state.lastSend = performance.now();
    writeStatus(`Manual command: ${label} (${command})`);
    detailedLogger.record("manual_serial_command", {
      label,
      command
    }, true);
  }

  async function sendRestKeepalive(reason) {
    if (!canSendPedals()) return;

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

  async function sendManualLine(lineOrValues, label) {
    if (!canSendPedals()) {
      writeStatus("Serial is not connected.");
      return;
    }

    stopBridge();
    window.clearInterval(state.manualStreamTimer);

    const lineForCurrentProtocol = () => (
      typeof lineOrValues === "string" ? lineOrValues : formatPedalLine(lineOrValues)
    );
    const initialLine = lineForCurrentProtocol();

    if (initialLine === bridge.REST_LINE) {
      const line = lineForCurrentProtocol();
      await sendLine(line);
      state.lastLine = line;
      state.lastSend = performance.now();
      state.manualHoldUntil = 0;
      writeStatus(`Manual send: ${label} (${line.trim()})`);
    } else {
      state.manualHoldUntil = performance.now() + 3000;
      const rate = Math.max(10, Math.min(120, Number(els.rate.value) || 50));
      const period = 1000 / rate;
      const streamLine = async () => {
        if (!canSendPedals()) {
          window.clearInterval(state.manualStreamTimer);
          return;
        }

        if (performance.now() >= state.manualHoldUntil) {
          window.clearInterval(state.manualStreamTimer);
          state.manualHoldUntil = 0;
          await sendLine(bridge.REST_LINE);
          state.lastLine = bridge.REST_LINE;
          state.lastSend = performance.now();
          writeStatus("Manual test complete. Outputs at rest.");
          return;
        }

        const line = lineForCurrentProtocol();
        await sendLine(line);
        state.lastLine = line;
        state.lastSend = performance.now();
      };

      await streamLine();
      state.manualStreamTimer = window.setInterval(() => {
        streamLine().catch((error) => writeStatus(error.message));
      }, period);
      writeStatus(`Manual stream: ${label} (${line.trim()})`);
    }

    detailedLogger.record("manual_serial_tx", {
      label,
      outputLine: initialLine.trim(),
      serialProtocol: state.serialProtocol,
      streamMs: initialLine === bridge.REST_LINE ? 0 : 3000
    }, true);
  }

  async function startSweepTest(pedal = "throttle") {
    if (!canSendPedals()) {
      writeStatus("Serial is not connected.");
      return;
    }

    stopBridge();
    window.clearInterval(state.manualStreamTimer);

    const startedAt = performance.now();
    const durationMs = 12000;
    const periodMs = 100;
    const pedalKeys = { clutch: "C", brake: "B", throttle: "T" };
    const commandPrefix = pedalKeys[pedal] || "T";

    const streamSweep = async () => {
      if (!canSendPedals()) {
        window.clearInterval(state.manualStreamTimer);
        return;
      }

      const elapsed = performance.now() - startedAt;
      if (elapsed >= durationMs) {
        window.clearInterval(state.manualStreamTimer);
        state.manualStreamTimer = 0;
        await sendManualCommand("R", "sweep complete rest");
        return;
      }

      const phase = (elapsed % 4000) / 4000;
      const pct = Math.round(phase < 0.5 ? phase * 200 : (1 - phase) * 200);
      const command = `${commandPrefix}${pct}`;
      await sendLine(`${command}\n`);
      state.lastLine = `${command}\n`;
      state.lastSend = performance.now();
      writeStatus(`Sweep ${pedal}: ${pct}% (${command})`);
    };

    await streamSweep();
    state.manualStreamTimer = window.setInterval(() => {
      streamSweep().catch((error) => writeStatus(error.message));
    }, periodMs);
    detailedLogger.record("manual_sweep_started", {
      pedal,
      durationMs,
      periodMs
    }, true);
  }

  async function runTick() {
    if (state.tickBusy) {
      state.skippedTicks++;
      return;
    }

    state.tickBusy = true;
    try {
      await tick();
    } finally {
      state.tickBusy = false;
    }
  }

  async function tick() {
    if (!state.running) {
      try {
        await sendRestKeepalive("bridge_stopped");
      } catch (error) {
        state.serialConfirmed = false;
        updateSerialStatus();
        writeStatus(error.message);
        detailedLogger.record("serial_write_error", { message: error.message });
      }
    }

    const pad = selectedGamepad();
    if (!pad) {
      detailedLogger.record("sample_no_gamepad", {
        running: state.running,
        serialConnected: canSendPedals(),
        serialConfirmed: state.serialConfirmed
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

    const line = formatPedalLine(output);
    const now = performance.now();
    const txMode = els.txMode.value || bridge.TX_MODE_DEFAULT;
    const shouldSend = state.running && canSendPedals() && (
      txMode === bridge.TX_MODE_CONTINUOUS ||
      line !== state.lastLine ||
      now - state.lastSend >= bridge.SERIAL_HEARTBEAT_MS
    );
    let sent = false;
    let sendReason = "none";

    if (shouldSend) {
      sendReason = line !== state.lastLine ? "changed" : "stream";
      state.lastLine = line;
      state.lastSend = now;
      try {
        await sendLine(line);
        sent = true;
        els.sendStatus.textContent = `Sending ${line.trim()}`;
      } catch (error) {
        stopBridge();
        state.serialConfirmed = false;
        updateSerialStatus();
        writeStatus(error.message);
        detailedLogger.record("serial_write_error", { message: error.message });
      }
    }

    detailedLogger.record("sample", {
      running: state.running,
      serialConnected: canSendPedals(),
      serialConfirmed: state.serialConfirmed,
      serialLastRxAgeMs: state.serialLastRx ? performance.now() - state.serialLastRx : null,
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
      skippedTicks: state.skippedTicks,
      settings: {
        pedalProfile: els.pedalProfile.value,
        serialProtocol: state.serialProtocol,
        txMode,
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
      now: performance.now(),
      running: state.running,
      serialConnected: canSendPedals(),
      serialConfirmed: isLocalBridgeTransport() ? state.localBridgeConnected : state.serialConfirmed,
      serialOpenAgeMs: state.serialOpenedAt ? performance.now() - state.serialOpenedAt : 0,
      serialLastRxAgeMs: state.serialLastRx ? performance.now() - state.serialLastRx : null,
      serialUnexpectedRx: state.serialUnexpectedRx,
      hasGamepad: Boolean(pad),
      lockGamepad: state.lockGamepad,
      selectedGamepadId: state.selectedGamepadId,
      lastSendAgeMs: state.lastSend ? performance.now() - state.lastSend : 0,
      guardCount: telemetry.state.guardCount,
      guardByPedal: telemetry.state.guardByPedal,
      dropoutGuardMs: currentDropoutGuards(),
      txRateHz: telemetry.state.txWindow.length,
      configuredRateHz: Number(els.rate.value) || 0,
      txMode: els.txMode.value || bridge.TX_MODE_DEFAULT,
      minimumTxRateHz: Math.floor((Number(els.rate.value) || 0) * 0.8),
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

    if (action.type === "disconnect_serial") {
      disconnectSerial().catch((error) => writeStatus(error.message));
      writeStatus("Recommendation applied: serial disconnected.");
    }

    if (action.type === "send_probe") {
      sendSerialProbe("recommendation").catch((error) => writeStatus(error.message));
      writeStatus("Recommendation applied: Arduino ping sent.");
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
    if (!canSendPedals()) {
      writeStatus("Serial is not connected.");
      updateButtons();
      return;
    }

    state.running = true;
    const rate = Math.max(10, Math.min(120, Number(els.rate.value) || 50));
    window.clearInterval(state.timer);
    state.timer = window.setInterval(runTick, 1000 / rate);
    runTick();
    setPill(els.sendStatus, "Running", true);
    detailedLogger.record("bridge_started", { settings: currentSettings() });
    updateButtons();
  }

  function cancelAutoStartRetry() {
    window.clearInterval(state.autoStartRetryTimer);
    state.autoStartRetryTimer = 0;
    state.autoStartDeadline = 0;
  }

  function requestAutoStartRetry(durationMs = 15000) {
    if (!state.autoStart || state.running) return;

    state.autoStartDeadline = Math.max(state.autoStartDeadline, performance.now() + durationMs);
    maybeAutoStart();
    if (state.running || state.autoStartRetryTimer) return;

    state.autoStartRetryTimer = window.setInterval(() => {
      if (!state.autoStart || state.running || performance.now() > state.autoStartDeadline) {
        cancelAutoStartRetry();
        return;
      }

      refreshGamepads();
      maybeAutoStart();
    }, 500);
  }

  function maybeAutoStart() {
    if (state.autoStart && !state.running && canSendPedals() && selectedGamepad()) {
      cancelAutoStartRetry();
      startBridge();
    }
  }

  function stopBridge() {
    state.running = false;
    cancelAutoStartRetry();
    window.clearInterval(state.timer);
    window.clearInterval(state.manualStreamTimer);
    state.manualStreamTimer = 0;
    state.timer = window.setInterval(runTick, 120);
    els.sendStatus.classList.remove("ok", "warn");
    els.sendStatus.textContent = "Stopped";
    detailedLogger.record("bridge_stopped", { settings: currentSettings() });
    updateButtons();
  }

  function updateButtons() {
    const hasPad = Boolean(selectedGamepad());
    const hasPort = Boolean(state.writer);
    const hasSerial = canSendPedals();
    els.connectSerial.textContent = isLocalBridgeTransport()
      ? state.localBridgeConnected ? "Disconnect Bridge" : "Connect Bridge"
      : hasPort ? "Disconnect Serial" : "Connect Serial";
    els.startBridge.disabled = state.running || !hasPad || !hasSerial;
    els.stopBridge.disabled = !state.running;
    els.connectSerial.disabled = false;
    els.testClutch.disabled = !hasSerial;
    els.testBrake.disabled = !hasSerial;
    els.testThrottle.disabled = !hasSerial;
    els.testRest.disabled = !hasSerial;
    els.testSweep.disabled = !hasSerial;
    renderCalibration();
  }

  function bindEvents() {
    els.refreshGamepads.addEventListener("click", refreshGamepads);
    els.connectSerial.addEventListener("click", () => connectSerial().catch((error) => writeStatus(error.message)));
    els.testClutch.addEventListener("click", () => sendManualCommand("C50", "clutch 50%").catch((error) => writeStatus(error.message)));
    els.testBrake.addEventListener("click", () => sendManualCommand("B50", "brake 50%").catch((error) => writeStatus(error.message)));
    els.testThrottle.addEventListener("click", () => sendManualCommand("T50", "throttle 50%").catch((error) => writeStatus(error.message)));
    els.testRest.addEventListener("click", () => sendManualCommand("R", "rest").catch((error) => writeStatus(error.message)));
    els.testSweep.addEventListener("click", () => startSweepTest("throttle").catch((error) => writeStatus(error.message)));
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
    els.serialTransport.addEventListener("change", () => {
      localStorage.setItem(`${bridge.STORAGE_PREFIX}serialTransport`, els.serialTransport.value);
      stopBridge();
      updateSerialStatus();
      updateButtons();
      writeStatus(els.serialTransport.value === bridge.TRANSPORT_LOCAL_BRIDGE
        ? "Local COM bridge selected. Start tools/local_serial_http_bridge.ps1 first."
        : "Browser Web Serial selected.");
    });
    els.txMode.addEventListener("change", () => {
      localStorage.setItem(`${bridge.STORAGE_PREFIX}txMode`, els.txMode.value);
      detailedLogger.record("tx_mode_changed", { txMode: els.txMode.value }, true);
      tick();
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
      requestAutoStartRetry(15000);
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
        if (!isPedalGamepad(pad)) {
          writeStatus(`Ignored non-pedal gamepad: ${pad.id}`);
          refreshGamepads();
          return;
        }

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

  function applyStartupOptions() {
    const params = new URLSearchParams(window.location.search);
    const transport = params.get("transport");

    if (transport === bridge.TRANSPORT_LOCAL_BRIDGE || transport === bridge.TRANSPORT_WEB_SERIAL) {
      els.serialTransport.value = transport;
      localStorage.setItem(`${bridge.STORAGE_PREFIX}serialTransport`, transport);
    }

    if (params.get("autostart") === "1") {
      state.autoStart = true;
      els.autoStart.checked = true;
      localStorage.setItem(`${bridge.STORAGE_PREFIX}autoStart`, "true");
    }
  }

  function init() {
    if (!("serial" in navigator)) {
      writeStatus("Open this page in Chrome or Edge with Web Serial support.");
    }

    bindEvents();
    loadSavedSettings();
    applyStartupOptions();
    detailedLogger.updateButtons();
    refreshPresetSelect();
    renderCalibration();
    refreshGamepads();
    startGamepadScanner();
    drawCurvePreview();
    stopBridge();
    if (isLocalBridgeTransport()) {
      connectLocalBridge().catch((error) => writeStatus(error.message));
    } else {
      reconnectGrantedSerial().catch((error) => writeStatus(error.message));
    }
  }

  init();
})(window.PedalBridge = window.PedalBridge || {});
