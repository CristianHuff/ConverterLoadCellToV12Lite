(function (bridge) {
  function createHealthMonitor(elements, onAction) {
    const state = {
      alerts: [],
      recommendations: [],
      renderSignature: "",
      restNoise: {
        sinceByPedal: {},
        lastSeenByPedal: {}
      }
    };

    function update(context) {
      const alerts = [];
      const recommendations = [];
      const now = Number(context.now) || performance.now();

      if (context.running && !context.serialConnected) {
        alerts.push({ level: "danger", text: "Bridge running without serial." });
        recommendations.push({
          key: "stop-no-serial",
          text: "Reconnect the Arduino serial port before starting a long test.",
          action: { type: "stop_bridge", label: "Stop Bridge" }
        });
      }

      if (context.serialConnected && !context.serialConfirmed && context.serialOpenAgeMs > 5000) {
        alerts.push({
          level: "warn",
          text: context.serialUnexpectedRx ? "Unexpected serial data." : "Arduino replies not confirmed."
        });
        recommendations.push({
          key: "serial-not-confirmed",
          text: context.serialUnexpectedRx
            ? "Serial data is unreadable. Check baud/firmware, close Serial Monitor, or choose the Arduino bridge COM port again."
            : "TX can still work, but the Arduino is not replying with bridge diagnostics. Confirm the serial bridge firmware when testing RX.",
          action: { type: "disconnect_serial", label: "Disconnect" }
        });
      }

      if (!context.running && context.serialConnected && context.serialConfirmed && Number(context.serialLastRxAgeMs) > 8000) {
        alerts.push({ level: "warn", text: "Arduino RX is quiet." });
        recommendations.push({
          key: "serial-rx-quiet",
          text: "The port is open, but Arduino diagnostic replies are quiet. Ping it when the bridge is stopped.",
          action: { type: "send_probe", label: "Ping" }
        });
      }

      if (context.running && !context.hasGamepad) {
        alerts.push({ level: "danger", text: "Bridge running without gamepad." });
        recommendations.push({
          key: "stop-no-gamepad",
          text: "Reconnect the locked pedal gamepad or choose the correct gamepad again.",
          action: { type: "stop_bridge", label: "Stop Bridge" }
        });
      }

      if (context.lockGamepad && context.selectedGamepadId && !context.hasGamepad) {
        alerts.push({ level: "warn", text: "Locked gamepad missing." });
        recommendations.push({
          key: "refresh-gamepads",
          text: "Keep lock enabled, but reconnect the Sim Ruito board before using the bridge.",
          action: { type: "refresh_gamepads", label: "Refresh" }
        });
      }

      if (context.running && context.serialConnected && context.lastSendAgeMs > 500) {
        alerts.push({ level: "warn", text: "Serial TX is stale." });
        recommendations.push({
          key: "serial-stale-rate",
          text: "Check the USB cable/hub and lower send rate if TX stalls continue.",
          action: suggestedRateAction(context)
        });
      }

      if (context.guardCount > 0) {
        alerts.push({ level: "warn", text: `Dropout guard events: ${context.guardCount}` });
        guardRecommendations(context).forEach((text) => recommendations.push(text));
      }

      if (Array.isArray(context.customCurve) && !isMonotonic(context.customCurve)) {
        alerts.push({ level: "warn", text: "Custom curve is not monotonic." });
        recommendations.push({
          key: "fix-custom-curve",
          text: "Adjust the custom throttle points so each value is equal to or higher than the previous one.",
          action: { type: "fix_curve", label: "Fix Curve" }
        });
      }

      const minimumTxRateHz = Math.max(2, Math.floor(Number(context.minimumTxRateHz) || 0));
      if (context.running && context.serialConnected && context.txMode !== "heartbeat" && minimumTxRateHz > 0 && context.txRateHz < minimumTxRateHz) {
        alerts.push({ level: "warn", text: "Serial stream below target." });
        recommendations.push({
          key: "low-tx-rate",
          text: `Serial TX is below the ${minimumTxRateHz} Hz low-latency target. Check browser load, cable, hub, or lower the send rate if this persists.`,
          action: suggestedRateAction(context)
        });
      }

      const restNoise = restNoisePedals(context.output, now);
      if (restNoise.length > 0 && Number(context.deadzonePct) === 0) {
        recommendations.push({
          key: "rest-noise-deadzone",
          text: `Small rest noise on ${restNoise.join(", ")}. Try 1% deadzone if it appears while pedals are released.`,
          action: { type: "set_deadzone", value: 1, label: "Set 1%" }
        });
      }

      state.alerts = alerts;
      state.recommendations = dedupe(recommendations);
      render();
      return { alerts: state.alerts, recommendations: state.recommendations };
    }

    function isMonotonic(values) {
      for (let index = 1; index < values.length; index++) {
        if (Number(values[index]) < Number(values[index - 1])) return false;
      }
      return true;
    }

    function guardRecommendations(context) {
      const result = [];
      const labels = { clutch: "clutch", brake: "brake", throttle: "throttle" };
      Object.entries(context.guardByPedal || {}).forEach(([key, count]) => {
        if (!count) return;
        const current = Number((context.dropoutGuardMs || {})[key]) || 0;
        const suggested = current > 0 ? 0 : 40;
        result.push({
          key: `guard-${key}-${suggested}`,
          text: current > 0
            ? `${labels[key]} had ${count} guarded dropouts. Set guard to 0 ms for lowest latency if this feels like pedal release delay.`
            : `${labels[key]} had ${count} dropouts. Use guard only if this is a real signal glitch, not normal pedal release.`,
          action: { type: "set_guard", pedal: key, value: suggested, label: `Set ${suggested} ms` }
        });
      });
      return result;
    }

    function suggestedRateAction(context) {
      const current = Number(context.configuredRateHz) || 50;
      const suggested = Math.max(10, Math.min(120, Math.floor(current * 0.8)));
      return { type: "set_rate", value: suggested, label: `Set ${suggested} Hz` };
    }

    function restNoisePedals(output, now) {
      if (!output) return [];

      const result = [];
      Object.entries(output).forEach(([key, value]) => {
        if (value > 0 && value <= 4) {
          if (!state.restNoise.sinceByPedal[key]) {
            state.restNoise.sinceByPedal[key] = now;
          }
          state.restNoise.lastSeenByPedal[key] = now;
        } else if (state.restNoise.lastSeenByPedal[key] && now - state.restNoise.lastSeenByPedal[key] > 1500) {
          delete state.restNoise.sinceByPedal[key];
          delete state.restNoise.lastSeenByPedal[key];
        }

        const since = state.restNoise.sinceByPedal[key];
        const lastSeen = state.restNoise.lastSeenByPedal[key];
        if (since && lastSeen && now - since >= 800 && now - lastSeen <= 1500) {
          result.push(key);
        }
      });

      return result;
    }

    function dedupe(items) {
      const seen = new Set();
      return items.filter((item) => {
        const key = item.key || item.text;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    function render() {
      const signature = JSON.stringify({
        alerts: state.alerts,
        recommendations: state.recommendations.map((recommendation) => ({
          key: recommendation.key,
          text: recommendation.text,
          action: recommendation.action
        }))
      });

      if (signature === state.renderSignature) {
        return;
      }
      state.renderSignature = signature;

      elements.healthAlerts.textContent = "";
      elements.recommendations.textContent = "";

      if (state.alerts.length === 0) {
        const item = document.createElement("div");
        item.className = "alert ok";
        item.textContent = "No alerts.";
        elements.healthAlerts.append(item);
      } else {
        state.alerts.forEach((alert) => {
          const item = document.createElement("div");
          item.className = `alert ${alert.level}`;
          item.textContent = alert.text;
          elements.healthAlerts.append(item);
        });
      }

      if (state.recommendations.length === 0) {
        const item = document.createElement("div");
        item.className = "recommendation";
        item.textContent = "No action suggested.";
        elements.recommendations.append(item);
        return;
      }

      state.recommendations.forEach((recommendation) => {
        const item = document.createElement("div");
        item.className = "recommendation";
        const text = document.createElement("span");
        text.textContent = recommendation.text;
        item.append(text);

        if (recommendation.action && typeof onAction === "function") {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "recommendation-action";
          button.textContent = recommendation.action.label || "Apply";
          button.addEventListener("click", () => onAction(recommendation.action));
          item.append(button);
        }

        elements.recommendations.append(item);
      });
    }

    render();
    return { state, update, render };
  }

  bridge.createHealthMonitor = createHealthMonitor;
})(window.PedalBridge = window.PedalBridge || {});
