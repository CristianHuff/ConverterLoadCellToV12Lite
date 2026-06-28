(function (bridge) {
  bridge.STORAGE_PREFIX = "gamepadSerialBridge.";
  bridge.DEFAULT_MAPPING_VERSION = "sim-ruito-axis-2-3-1";
  bridge.SERIAL_BAUD_RATE = 115200;
  bridge.SERIAL_HEARTBEAT_MS = 100;
  bridge.SERIAL_PROBE_MS = 300;
  bridge.SERIAL_BOOT_GRACE_MS = 3500;
  bridge.SERIAL_CONFIRM_TIMEOUT_MS = 5000;
  bridge.SERIAL_PROBE_BURST_MS = 7000;
  bridge.SERIAL_PING_LINE = "PING\n";
  bridge.REST_LINE = "0,0,0\n";
  bridge.TRANSPORT_WEB_SERIAL = "web-serial";
  bridge.TRANSPORT_LOCAL_BRIDGE = "local-bridge";
  bridge.TRANSPORT_DEFAULT = bridge.TRANSPORT_LOCAL_BRIDGE;
  bridge.LOCAL_BRIDGE_URL = "http://127.0.0.1:17384";
  bridge.SERIAL_PROTOCOL_CURRENT = "clutch,brake,throttle";
  bridge.SERIAL_PROTOCOL_LEGACY = "brake,throttle,clutch";
  bridge.SERIAL_PROTOCOL_DEFAULT = bridge.SERIAL_PROTOCOL_CURRENT;
  bridge.TX_MODE_CONTINUOUS = "continuous";
  bridge.TX_MODE_HEARTBEAT = "heartbeat";
  bridge.TX_MODE_DEFAULT = bridge.TX_MODE_CONTINUOUS;
  bridge.PEDAL_GAMEPAD_PATTERN = /sim\s*ruito|ruito|pedal|freejoy/i;
  bridge.REMOTE_GAMEPAD_PATTERN = /xbox|xinput|moonlight|vigem|virtual|controller/i;
  bridge.PEDAL_ORDER = ["clutch", "brake", "throttle"];
  bridge.PEDAL_DEFAULTS = {
    clutch: { label: "Clutch", axis: 1 },
    brake: { label: "Brake", axis: 2 },
    throttle: { label: "Throttle", axis: 3 }
  };
  bridge.GT7_THROTTLE_INPUT = [0, 25, 50, 75, 100];
  bridge.GT7_THROTTLE_OUTPUT = [0, 45, 75, 90, 100];
})(window.PedalBridge = window.PedalBridge || {});
