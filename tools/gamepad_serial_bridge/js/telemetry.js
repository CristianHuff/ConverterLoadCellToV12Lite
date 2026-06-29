(function (bridge) {
  function createTelemetry(elements) {
    const state = {
      txCount: 0,
      guardCount: 0,
      guardByPedal: { clutch: 0, brake: 0, throttle: 0 },
      txWindow: [],
      lastLine: "0,0,0",
      history: []
    };

    function prune(now) {
      state.txWindow = state.txWindow.filter((time) => now - time <= 1000);
    }

    function render() {
      const now = performance.now();
      prune(now);
      elements.txRate.textContent = `${state.txWindow.length} Hz`;
      elements.txCount.textContent = String(state.txCount);
      elements.guardCount.textContent = String(state.guardCount);
      elements.lastLine.textContent = state.lastLine;
      drawHistory();
    }

    function markTx(line) {
      const now = performance.now();
      state.txCount += 1;
      state.txWindow.push(now);
      state.lastLine = line.trim();
      render();
    }

    function syncNativeTx(count, line, rateHz, running) {
      const now = performance.now();
      state.txCount = Math.max(state.txCount, Number(count) || 0);
      state.lastLine = String(line || state.lastLine).trim();
      if (running) {
        const visibleRate = Math.max(0, Math.min(120, Math.round(Number(rateHz) || 0)));
        state.txWindow = Array.from({ length: visibleRate }, () => now);
      }
      render();
    }

    function markGuardedDrop(key) {
      state.guardCount += 1;
      if (key && Object.prototype.hasOwnProperty.call(state.guardByPedal, key)) {
        state.guardByPedal[key] += 1;
      }
      render();
    }

    function markSample(output) {
      state.history.push({
        clutch: output.clutch || 0,
        brake: output.brake || 0,
        throttle: output.throttle || 0
      });
      if (state.history.length > 120) {
        state.history.shift();
      }
      drawHistory();
    }

    function drawHistory() {
      const canvas = elements.signalHistory;
      if (!canvas) return;

      const context = canvas.getContext("2d");
      const width = canvas.width;
      const height = canvas.height;
      const pad = 12;
      const plotWidth = width - pad * 2;
      const plotHeight = height - pad * 2;
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#10171a";
      context.fillRect(0, 0, width, height);

      context.strokeStyle = "rgba(149, 163, 170, 0.2)";
      context.lineWidth = 1;
      for (let step = 0; step <= 4; step++) {
        const y = pad + (plotHeight * step) / 4;
        context.beginPath();
        context.moveTo(pad, y);
        context.lineTo(width - pad, y);
        context.stroke();
      }

      drawLine("clutch", "#f0c241");
      drawLine("brake", "#e03b2f");
      drawLine("throttle", "#10b5a5");

      function drawLine(key, color) {
        context.strokeStyle = color;
        context.lineWidth = 2;
        context.beginPath();
        state.history.forEach((sample, index) => {
          const x = pad + (index / Math.max(1, state.history.length - 1)) * plotWidth;
          const y = height - pad - (sample[key] / 100) * plotHeight;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.stroke();
      }
    }

    function reset() {
      state.txCount = 0;
      state.guardCount = 0;
      state.guardByPedal = { clutch: 0, brake: 0, throttle: 0 };
      state.txWindow = [];
      state.lastLine = "0,0,0";
      state.history = [];
      render();
    }

    render();
    return { state, render, markTx, syncNativeTx, markGuardedDrop, markSample, reset };
  }

  bridge.createTelemetry = createTelemetry;
})(window.PedalBridge = window.PedalBridge || {});
