(function (bridge) {
  bridge.STORAGE_PREFIX = "gamepadSerialBridge.";
  bridge.DEFAULT_MAPPING_VERSION = "sim-ruito-axis-2-3-1";
  bridge.SERIAL_BAUD_RATE = 115200;
  bridge.SERIAL_HEARTBEAT_MS = 100;
  bridge.REST_LINE = "0,0,0\n";
  bridge.PEDAL_ORDER = ["clutch", "brake", "throttle"];
  bridge.PEDAL_DEFAULTS = {
    clutch: { label: "Clutch", axis: 1 },
    brake: { label: "Brake", axis: 2 },
    throttle: { label: "Throttle", axis: 3 }
  };
  bridge.GT7_THROTTLE_INPUT = [0, 25, 50, 75, 100];
  bridge.GT7_THROTTLE_OUTPUT = [0, 45, 75, 90, 100];
})(window.PedalBridge = window.PedalBridge || {});
