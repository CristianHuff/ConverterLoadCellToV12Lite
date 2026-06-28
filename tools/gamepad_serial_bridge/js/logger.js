(function (bridge) {
  function createDetailedLogger(elements, getSettings, writeStatus) {
    const state = {
      enabled: false,
      entries: [],
      writer: null,
      pending: Promise.resolve(),
      seq: 0
    };

    function fileName() {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      return `pedal_bridge_${stamp}.txt`;
    }

    function updateButtons() {
      elements.startLog.textContent = state.enabled ? "Stop Log" : "Start Log";
      elements.downloadLog.disabled = state.entries.length === 0;
      elements.clearLog.disabled = state.entries.length === 0 || state.enabled;
      elements.markLog.disabled = !state.enabled;
      elements.detailedLog.checked = state.enabled;
    }

    function record(type, data = {}, force = false) {
      if (!state.enabled && !force) return;

      const entry = {
        seq: state.seq++,
        type,
        wallTime: new Date().toISOString(),
        perfMs: Math.round(performance.now() * 1000) / 1000,
        ...data
      };
      const line = `${JSON.stringify(entry)}\n`;
      state.entries.push(line);

      if (state.writer) {
        state.pending = state.pending
          .then(() => state.writer.write(line))
          .catch((error) => {
            writeStatus(`Log write failed: ${error.message}`);
            state.writer = null;
          });
      }

      if (force || (type !== "sample" && type !== "serial_keepalive")) {
        updateButtons();
      }
    }

    async function start() {
      state.entries = [];
      state.seq = 0;
      state.writer = null;
      state.pending = Promise.resolve();

      if ("showSaveFilePicker" in window) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: fileName(),
            types: [
              {
                description: "Text log",
                accept: { "text/plain": [".txt", ".jsonl"] }
              }
            ]
          });
          state.writer = await handle.createWritable();
        } catch (error) {
          if (error.name === "AbortError") {
            writeStatus("Log file selection cancelled.");
            updateButtons();
            return;
          }
          writeStatus(`Using in-memory log: ${error.message}`);
        }
      }

      state.enabled = true;
      record("log_start", {
        settings: getSettings(),
        userAgent: navigator.userAgent,
        fileWriter: Boolean(state.writer)
      }, true);
      writeStatus(state.writer ? "Detailed log started." : "Detailed log started in memory.");
      updateButtons();
    }

    async function stop() {
      record("log_stop", { settings: getSettings() }, true);
      state.enabled = false;
      await state.pending;
      if (state.writer) {
        await state.writer.close();
        state.writer = null;
      }
      writeStatus("Detailed log stopped.");
      updateButtons();
    }

    function download() {
      if (state.entries.length === 0) return;

      const blob = new Blob(state.entries, { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName();
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    function clear() {
      if (state.enabled) return;
      state.entries = [];
      state.seq = 0;
      updateButtons();
      writeStatus("Log cleared.");
    }

    updateButtons();
    return { state, start, stop, download, clear, record, updateButtons };
  }

  bridge.createDetailedLogger = createDetailedLogger;
})(window.PedalBridge = window.PedalBridge || {});
