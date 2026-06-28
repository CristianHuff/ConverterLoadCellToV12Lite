(function (bridge) {
  function downloadJson(fileName, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function readJsonFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        try {
          resolve(JSON.parse(String(reader.result || "{}")));
        } catch (error) {
          reject(error);
        }
      });
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsText(file);
    });
  }

  function savePreset(storageKey, settings) {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  }

  function loadPreset(storageKey) {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  }

  function namedPresets(storageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveNamedPreset(storageKey, name, settings) {
    const presets = namedPresets(storageKey);
    presets[name] = settings;
    localStorage.setItem(storageKey, JSON.stringify(presets));
    return presets;
  }

  function deleteNamedPreset(storageKey, name) {
    const presets = namedPresets(storageKey);
    delete presets[name];
    localStorage.setItem(storageKey, JSON.stringify(presets));
    return presets;
  }

  bridge.downloadJson = downloadJson;
  bridge.readJsonFile = readJsonFile;
  bridge.savePreset = savePreset;
  bridge.loadPreset = loadPreset;
  bridge.namedPresets = namedPresets;
  bridge.saveNamedPreset = saveNamedPreset;
  bridge.deleteNamedPreset = deleteNamedPreset;
})(window.PedalBridge = window.PedalBridge || {});
