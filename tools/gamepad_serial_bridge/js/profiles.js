(function (bridge) {
  function clampPct(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  function applyCurveTable(pct, inputPoints, outputPoints) {
    pct = clampPct(pct);
    if (pct <= inputPoints[0]) return outputPoints[0];
    if (pct >= inputPoints[inputPoints.length - 1]) return outputPoints[outputPoints.length - 1];

    for (let index = 1; index < inputPoints.length; index++) {
      if (pct <= inputPoints[index]) {
        const inputLow = inputPoints[index - 1];
        const inputHigh = inputPoints[index];
        const outputLow = outputPoints[index - 1];
        const outputHigh = outputPoints[index];
        const ratio = (pct - inputLow) / (inputHigh - inputLow);
        return clampPct(outputLow + ratio * (outputHigh - outputLow));
      }
    }

    return pct;
  }

  function applyPedalProfile(profile, key, pct, customOutputPoints) {
    if (key === "throttle" && profile === "gt7") {
      return applyCurveTable(pct, bridge.GT7_THROTTLE_INPUT, bridge.GT7_THROTTLE_OUTPUT);
    }

    if (key === "throttle" && profile === "custom" && Array.isArray(customOutputPoints)) {
      return applyCurveTable(pct, bridge.GT7_THROTTLE_INPUT, customOutputPoints);
    }

    return clampPct(pct);
  }

  bridge.clampPct = clampPct;
  bridge.applyCurveTable = applyCurveTable;
  bridge.applyPedalProfile = applyPedalProfile;
})(window.PedalBridge = window.PedalBridge || {});
