(function (bridge) {
  function createHealthMonitor(elements, onAction) {
    const state = {
      alerts: [],
      recommendations: []
    };

    function update(context) {
      const alerts = [];
      const recommendations = [];

      if (context.running && !context.serialConnected) {
        alerts.push({ level: "danger", text: "Bridge running without serial." });
        recommendations.push({
          key: "stop-no-serial",
          text: "Reconnect the Arduino serial port before starting a long test.",
          action: { type: "stop_bridge", label: "Stop Bridge" }
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

      if (context.running && context.serialConnected && context.configuredRateHz > 0 && context.txRateHz < context.configuredRateHz * 0.6) {
        alerts.push({ level: "warn", text: "TX rate below target." });
        recommendations.push({
          key: "low-tx-rate",
          text: `Reduce send rate or inspect browser/USB load; target is ${context.configuredRateHz} Hz.`,
          action: suggestedRateAction(context)
        });
      }

      const restNoise = restNoisePedals(context.output);
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
        const suggested = Math.min(250, current + 40);
        result.push({
          key: `guard-${key}-${suggested}`,
          text: `${labels[key]} had ${count} guarded dropouts. Try ${suggested} ms if real pedal input is dropping.`,
          action: { type: "set_guard", pedal: key, value: suggested, label: `Apply ${suggested} ms` }
        });
      });
      return result;
    }

    function suggestedRateAction(context) {
      const current = Number(context.configuredRateHz) || 50;
      const suggested = Math.max(10, Math.min(120, Math.floor(current * 0.8)));
      return { type: "set_rate", value: suggested, label: `Set ${suggested} Hz` };
    }

    function restNoisePedals(output) {
      if (!output) return [];
      return Object.entries(output)
        .filter(([, value]) => value > 0 && value <= 3)
        .map(([key]) => key);
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
