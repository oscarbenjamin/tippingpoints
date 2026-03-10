(function () {
  const rhsCanvas = document.getElementById("rhs-canvas");
  const rhsCtx = rhsCanvas.getContext("2d");
  const timeCanvas = document.getElementById("timeseries-canvas");
  const timeCtx = timeCanvas.getContext("2d");
  const climateCanvas = document.getElementById("climate-timeseries-canvas");
  const climateCtx = climateCanvas.getContext("2d");
  const iceCanvas = document.getElementById("ice-animation-canvas");
  const iceCtx = iceCanvas.getContext("2d");
  const iceImage = new Image();
  iceImage.src = "arctic_sea_ice.webp";

  const pValueEl = document.getElementById("p-value");
  const xValueEl = document.getElementById("x-value");
  const decreaseButton = document.getElementById("decrease-p");
  const increaseButton = document.getElementById("increase-p");
  const resetButton = document.getElementById("reset-system");
  const toggleDemo1Button = document.getElementById("toggle-demo-1");
  const emissionsValueEl = document.getElementById("emissions-value");
  const co2ValueEl = document.getElementById("co2-value");
  const iceValueEl = document.getElementById("ice-value");
  const decreaseEmissionsButton = document.getElementById("decrease-emissions");
  const increaseEmissionsButton = document.getElementById("increase-emissions");
  const resetClimateButton = document.getElementById("reset-climate");
  const toggleDemo2Button = document.getElementById("toggle-demo-2");

  const xDomain = { min: -1.8, max: 1.8 };
  const rhsRange = { min: -2.4, max: 2.4 };
  const historyDuration = 28;
  const dt = 0.02;
  const pStep = 0.035;
  const pLimits = { min: -0.65, max: 0.65 };
  const climateDuration = 180;
  const climateDt = 0.08;
  const emissionsStep = 0.35;
  const emissionsLimits = { min: 2.5, max: 13.5 };
  const co2Baseline = 280;
  const co2PpmPerGtC = 0.47;
  const drawdownRate = 0.015;
  const iceMeanRange = { min: 0, max: 8.5 };

  let state = createInitialState(-0.25);
  let climateState = createClimateInitialState();
  let lastFrame = performance.now();
  let demo1Running = true;
  let demo2Running = true;

  function rhs(x, p) {
    return x - x * x * x + p;
  }

  function drhs(x) {
    return 1 - 3 * x * x;
  }

  function createInitialState(initialP) {
    const x0 = findNegativeStableEquilibrium(initialP);
    return {
      time: 0,
      x: x0,
      p: initialP,
      history: [{ time: 0, x: x0, p: initialP }],
    };
  }

  function createClimateInitialState() {
    const emissions = 7.4;
    const co2 = 323;
    const forcing = co2ToForcing(co2);
    const ice = findNegativeStableEquilibrium(forcing);

    return {
      time: 0,
      emissions,
      co2,
      forcing,
      ice,
      history: [{ time: 0, emissions, co2, ice }],
    };
  }

  function co2ToForcing(co2) {
    return clamp((co2 - 340) / 95, -0.65, 0.65);
  }

  function iceStateToArea(iceState) {
    const normalized = clamp((-iceState + 1.3) / 2.3, 0, 1);
    return normalized * iceMeanRange.max;
  }

  function findNegativeStableEquilibrium(p) {
    let bestX = -1;
    let bestResidual = Infinity;

    for (let x = xDomain.min; x <= 0.2; x += 0.005) {
      const residual = Math.abs(rhs(x, p));
      const stable = drhs(x) < 0;

      if (stable && residual < bestResidual) {
        bestResidual = residual;
        bestX = x;
      }
    }

    for (let i = 0; i < 12; i += 1) {
      const slope = drhs(bestX);
      if (Math.abs(slope) < 1e-6) {
        break;
      }
      bestX -= rhs(bestX, p) / slope;
    }

    return clamp(bestX, xDomain.min, xDomain.max);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function xToPx(x, bounds, domain) {
    return (
      bounds.left +
      ((x - domain.min) / (domain.max - domain.min)) * (bounds.right - bounds.left)
    );
  }

  function yToPx(y, bounds, range) {
    return (
      bounds.bottom -
      ((y - range.min) / (range.max - range.min)) * (bounds.bottom - bounds.top)
    );
  }

  function drawAxes(ctx, bounds, xTicks, yTicks, xLabel, yLabel, xMap, yMap) {
    ctx.strokeStyle = "rgba(32, 77, 99, 0.22)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#5f6b76";
    ctx.font = "12px Helvetica Neue, Arial, sans-serif";

    ctx.beginPath();
    xTicks.forEach((tick) => {
      const x = xMap(tick);
      ctx.moveTo(x, bounds.top);
      ctx.lineTo(x, bounds.bottom);
    });
    yTicks.forEach((tick) => {
      const y = yMap(tick);
      ctx.moveTo(bounds.left, y);
      ctx.lineTo(bounds.right, y);
    });
    ctx.stroke();

    ctx.strokeStyle = "rgba(31, 41, 51, 0.65)";
    ctx.beginPath();
    ctx.moveTo(bounds.left, yMap(0));
    ctx.lineTo(bounds.right, yMap(0));
    ctx.moveTo(xMap(0), bounds.top);
    ctx.lineTo(xMap(0), bounds.bottom);
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    xTicks.forEach((tick) => {
      ctx.fillText(formatTick(tick), xMap(tick), bounds.bottom + 8);
    });

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    yTicks.forEach((tick) => {
      if (Math.abs(tick) < 1e-9) {
        return;
      }
      ctx.fillText(formatTick(tick), bounds.left - 10, yMap(tick));
    });

    ctx.save();
    ctx.fillStyle = "#1f2933";
    ctx.textAlign = "right";
    ctx.fillText(xLabel, bounds.right, bounds.bottom + 28);
    ctx.translate(bounds.left - 42, bounds.top);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "left";
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }

  function formatTick(value) {
    if (Math.abs(value) < 1e-9) {
      return "0";
    }
    return value.toFixed(1);
  }

  function drawRhsPlot() {
    const { width, height } = rhsCanvas;
    rhsCtx.clearRect(0, 0, width, height);

    const bounds = { left: 68, right: width - 24, top: 22, bottom: height - 58 };
    const mapX = (x) => xToPx(x, bounds, xDomain);
    const mapY = (y) => yToPx(y, bounds, rhsRange);

    drawAxes(
      rhsCtx,
      bounds,
      [-1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5],
      [-2, -1, 0, 1, 2],
      "x",
      "f(x)",
      mapX,
      mapY
    );

    rhsCtx.strokeStyle = "#204d63";
    rhsCtx.lineWidth = 3;
    rhsCtx.beginPath();

    let started = false;
    for (let x = xDomain.min; x <= xDomain.max; x += 0.01) {
      const px = mapX(x);
      const py = mapY(rhs(x, state.p));
      if (!started) {
        rhsCtx.moveTo(px, py);
        started = true;
      } else {
        rhsCtx.lineTo(px, py);
      }
    }
    rhsCtx.stroke();

    const currentFx = rhs(state.x, state.p);
    const xPixel = mapX(state.x);
    const axisY = mapY(0);
    const fxPixel = mapY(currentFx);

    rhsCtx.strokeStyle = "rgba(193, 59, 42, 0.35)";
    rhsCtx.lineWidth = 2;
    rhsCtx.setLineDash([6, 6]);
    rhsCtx.beginPath();
    rhsCtx.moveTo(xPixel, axisY);
    rhsCtx.lineTo(xPixel, fxPixel);
    rhsCtx.stroke();
    rhsCtx.setLineDash([]);

    rhsCtx.fillStyle = "#c13b2a";
    rhsCtx.beginPath();
    rhsCtx.arc(xPixel, axisY, 8, 0, Math.PI * 2);
    rhsCtx.fill();

    rhsCtx.fillStyle = "#204d63";
    rhsCtx.beginPath();
    rhsCtx.arc(xPixel, fxPixel, 6, 0, Math.PI * 2);
    rhsCtx.fill();

    rhsCtx.fillStyle = "#1f2933";
    rhsCtx.font = "13px Helvetica Neue, Arial, sans-serif";
    rhsCtx.textAlign = "left";
    rhsCtx.fillText("state on x-axis", xPixel + 12, axisY - 18);
    rhsCtx.fillText("f(x)", xPixel + 12, fxPixel - 10);
  }

  function drawTimeSeriesPlot() {
    const { width, height } = timeCanvas;
    timeCtx.clearRect(0, 0, width, height);

    const bounds = { left: 68, right: width - 28, top: 22, bottom: height - 58 };
    const latestTime = state.history[state.history.length - 1].time;
    const earliestTime = Math.max(0, latestTime - historyDuration);
    const xRange = { min: earliestTime, max: earliestTime + historyDuration };
    const yRange = { min: -1.8, max: 1.8 };

    const mapX = (t) => xToPx(t, bounds, xRange);
    const mapY = (value) => yToPx(value, bounds, yRange);

    drawAxes(
      timeCtx,
      bounds,
      buildTimeTicks(earliestTime, historyDuration),
      [-1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5],
      "time",
      "value",
      mapX,
      mapY
    );

    timeCtx.strokeStyle = "#146c94";
    timeCtx.lineWidth = 3;
    traceHistory(timeCtx, state.history, mapX, mapY, "x");

    timeCtx.strokeStyle = "#c77900";
    timeCtx.lineWidth = 2.5;
    traceHistory(timeCtx, state.history, mapX, mapY, "p");

    const latest = state.history[state.history.length - 1];
    timeCtx.fillStyle = "#146c94";
    timeCtx.beginPath();
    timeCtx.arc(mapX(latest.time), mapY(latest.x), 5, 0, Math.PI * 2);
    timeCtx.fill();

    timeCtx.fillStyle = "#c77900";
    timeCtx.beginPath();
    timeCtx.arc(mapX(latest.time), mapY(latest.p), 5, 0, Math.PI * 2);
    timeCtx.fill();

    drawLegend();
  }

  function buildTimeTicks(start, span) {
    const ticks = [];
    const step = span / 4;
    for (let i = 0; i <= 4; i += 1) {
      ticks.push(Number((start + i * step).toFixed(1)));
    }
    return ticks;
  }

  function traceHistory(ctx, history, mapX, mapY, key) {
    ctx.beginPath();
    let started = false;
    history.forEach((entry) => {
      const px = mapX(entry.time);
      const py = mapY(entry[key]);
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    });
    ctx.stroke();
  }

  function drawLegend() {
    const x = timeCanvas.width - 160;
    const y = 34;

    timeCtx.font = "13px Helvetica Neue, Arial, sans-serif";
    timeCtx.textAlign = "left";
    timeCtx.textBaseline = "middle";

    timeCtx.strokeStyle = "#146c94";
    timeCtx.lineWidth = 3;
    timeCtx.beginPath();
    timeCtx.moveTo(x, y);
    timeCtx.lineTo(x + 22, y);
    timeCtx.stroke();
    timeCtx.fillStyle = "#1f2933";
    timeCtx.fillText("x(t)", x + 30, y);

    timeCtx.strokeStyle = "#c77900";
    timeCtx.lineWidth = 2.5;
    timeCtx.beginPath();
    timeCtx.moveTo(x, y + 24);
    timeCtx.lineTo(x + 22, y + 24);
    timeCtx.stroke();
    timeCtx.fillText("p(t)", x + 30, y + 24);
  }

  function drawClimateLegend() {
    const x = climateCanvas.width - 188;
    const y = 34;

    climateCtx.font = "13px Helvetica Neue, Arial, sans-serif";
    climateCtx.textAlign = "left";
    climateCtx.textBaseline = "middle";

    const items = [
      { color: "#1f6b8f", label: "Emissions / 10" },
      { color: "#c77900", label: "CO2 anomaly / 100" },
      { color: "#167a5a", label: "Sea ice / 8" },
    ];

    items.forEach((item, index) => {
      const yOffset = y + index * 24;
      climateCtx.strokeStyle = item.color;
      climateCtx.lineWidth = 3;
      climateCtx.beginPath();
      climateCtx.moveTo(x, yOffset);
      climateCtx.lineTo(x + 22, yOffset);
      climateCtx.stroke();
      climateCtx.fillStyle = "#1f2933";
      climateCtx.fillText(item.label, x + 30, yOffset);
    });
  }

  function drawClimateTimeSeries() {
    const { width, height } = climateCanvas;
    climateCtx.clearRect(0, 0, width, height);

    const bounds = { left: 68, right: width - 28, top: 22, bottom: height - 58 };
    const latestTime = climateState.history[climateState.history.length - 1].time;
    const earliestTime = Math.max(0, latestTime - climateDuration);
    const xRange = { min: earliestTime, max: earliestTime + climateDuration };
    const yRange = { min: 0, max: 1.8 };

    const mapX = (t) => xToPx(t, bounds, xRange);
    const mapY = (value) => yToPx(value, bounds, yRange);

    drawAxes(
      climateCtx,
      bounds,
      buildTimeTicks(earliestTime, climateDuration),
      [0, 0.45, 0.9, 1.35, 1.8],
      "years",
      "scaled value",
      mapX,
      mapY
    );

    climateCtx.strokeStyle = "#1f6b8f";
    climateCtx.lineWidth = 3;
    traceScaledHistory(climateCtx, climateState.history, mapX, mapY, (entry) => entry.emissions / 10);

    climateCtx.strokeStyle = "#c77900";
    climateCtx.lineWidth = 3;
    traceScaledHistory(
      climateCtx,
      climateState.history,
      mapX,
      mapY,
      (entry) => (entry.co2 - co2Baseline) / 100
    );

    climateCtx.strokeStyle = "#167a5a";
    climateCtx.lineWidth = 3;
    traceScaledHistory(
      climateCtx,
      climateState.history,
      mapX,
      mapY,
      (entry) => iceStateToArea(entry.ice) / 8
    );

    drawClimateLegend();
  }

  function traceScaledHistory(ctx, history, mapX, mapY, transform) {
    ctx.beginPath();
    let started = false;
    history.forEach((entry) => {
      const px = mapX(entry.time);
      const py = mapY(transform(entry));
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    });
    ctx.stroke();
  }

  function drawIceAnimation(nowSeconds) {
    const { width, height } = iceCanvas;
    iceCtx.clearRect(0, 0, width, height);

    const centerX = width * 0.5;
    const centerY = height * 0.54;
    const area = iceStateToArea(climateState.ice);
    const meanRadius = 46 + area * 14.5;
    const seasonalCycle = ((climateState.time % 1) + nowSeconds * 0.02) * Math.PI * 2;
    const seasonalAmplitude = (0.5 - 0.5 * Math.cos(seasonalCycle)) * (14 + area * 1.35);

    const oceanGradient = iceCtx.createRadialGradient(centerX, centerY - 24, 40, centerX, centerY, 220);
    oceanGradient.addColorStop(0, "rgba(189, 225, 244, 0.95)");
    oceanGradient.addColorStop(1, "rgba(28, 85, 124, 0.96)");
    iceCtx.fillStyle = oceanGradient;
    iceCtx.fillRect(0, 0, width, height);

    iceCtx.fillStyle = "rgba(255, 255, 255, 0.15)";
    iceCtx.beginPath();
    iceCtx.arc(centerX, centerY, 150, 0, Math.PI * 2);
    iceCtx.fill();

    iceCtx.beginPath();
    for (let angle = 0; angle <= Math.PI * 2 + 0.05; angle += 0.05) {
      const texture = Math.sin(angle * 5 + climateState.time * 0.45) * 4;
      const shapeBias = 1 + 0.16 * Math.cos(angle - Math.PI / 2) - 0.1 * Math.cos(2 * angle);
      const radius = meanRadius + seasonalAmplitude * shapeBias + texture;
      const px = centerX + Math.cos(angle) * radius * 1.18;
      const py = centerY + Math.sin(angle) * radius * 0.82;

      if (angle === 0) {
        iceCtx.moveTo(px, py);
      } else {
        iceCtx.lineTo(px, py);
      }
    }
    iceCtx.closePath();

    if (iceImage.complete && iceImage.naturalWidth > 0) {
      iceCtx.save();
      iceCtx.clip();

      const imageRatio = iceImage.naturalWidth / iceImage.naturalHeight;
      const drawWidth = width * 0.88;
      const drawHeight = drawWidth / imageRatio;
      const imageX = (width - drawWidth) * 0.5;
      const imageY = centerY - drawHeight * 0.5;

      iceCtx.globalAlpha = 0.96;
      iceCtx.drawImage(iceImage, imageX, imageY, drawWidth, drawHeight);

      const gloss = iceCtx.createLinearGradient(0, centerY - 120, 0, centerY + 120);
      gloss.addColorStop(0, "rgba(255, 255, 255, 0.28)");
      gloss.addColorStop(1, "rgba(255, 255, 255, 0.02)");
      iceCtx.fillStyle = gloss;
      iceCtx.fillRect(0, 0, width, height);
      iceCtx.restore();
    } else {
      const iceGradient = iceCtx.createRadialGradient(
        centerX - 24,
        centerY - 24,
        14,
        centerX,
        centerY,
        190
      );
      iceGradient.addColorStop(0, "rgba(255, 255, 255, 0.98)");
      iceGradient.addColorStop(0.7, "rgba(216, 239, 249, 0.96)");
      iceGradient.addColorStop(1, "rgba(160, 205, 224, 0.94)");
      iceCtx.fillStyle = iceGradient;
      iceCtx.fill();
    }

    iceCtx.strokeStyle = "rgba(17, 67, 94, 0.24)";
    iceCtx.lineWidth = 2;
    iceCtx.stroke();

    iceCtx.fillStyle = "#ffffff";
    iceCtx.font = "700 18px Helvetica Neue, Arial, sans-serif";
    iceCtx.textAlign = "left";
    iceCtx.fillText(`Year ${Math.floor(climateState.time)}`, 24, 34);

    iceCtx.font = "14px Helvetica Neue, Arial, sans-serif";
    iceCtx.fillText(`CO2 ${climateState.co2.toFixed(0)} ppm`, 24, 58);
    iceCtx.fillText(`Mean sea ice ${area.toFixed(1)} million km²`, 24, 80);
    iceCtx.fillText("Winter growth and summer melt continue around a shrinking mean edge.", 24, height - 28);
  }

  function integrateStep(stepDt) {
    const x = state.x;
    const p = state.p;

    const k1 = rhs(x, p);
    const k2 = rhs(x + 0.5 * stepDt * k1, p);
    const k3 = rhs(x + 0.5 * stepDt * k2, p);
    const k4 = rhs(x + stepDt * k3, p);

    state.x = clamp(x + (stepDt / 6) * (k1 + 2 * k2 + 2 * k3 + k4), -2, 2);
    state.time += stepDt;
    state.history.push({ time: state.time, x: state.x, p: state.p });

    while (state.history.length > 2 && state.history[1].time < state.time - historyDuration) {
      state.history.shift();
    }
  }

  function integrateClimateStep(stepDt) {
    const co2Tendency =
      climateState.emissions * co2PpmPerGtC - drawdownRate * (climateState.co2 - co2Baseline);
    climateState.co2 += co2Tendency * stepDt;
    climateState.forcing = co2ToForcing(climateState.co2);

    const x = climateState.ice;
    const p = climateState.forcing;
    const k1 = rhs(x, p);
    const k2 = rhs(x + 0.5 * stepDt * k1, p);
    const k3 = rhs(x + 0.5 * stepDt * k2, p);
    const k4 = rhs(x + stepDt * k3, p);

    climateState.ice = clamp(x + (stepDt / 6) * (k1 + 2 * k2 + 2 * k3 + k4), -2, 2);
    climateState.time += stepDt;
    climateState.history.push({
      time: climateState.time,
      emissions: climateState.emissions,
      co2: climateState.co2,
      ice: climateState.ice,
    });

    while (
      climateState.history.length > 2 &&
      climateState.history[1].time < climateState.time - climateDuration
    ) {
      climateState.history.shift();
    }
  }

  function updateReadouts() {
    pValueEl.textContent = state.p.toFixed(3);
    xValueEl.textContent = state.x.toFixed(3);
    emissionsValueEl.textContent = `${climateState.emissions.toFixed(1)} GtC/yr`;
    co2ValueEl.textContent = `${climateState.co2.toFixed(0)} ppm`;
    iceValueEl.textContent = `${iceStateToArea(climateState.ice).toFixed(1)} million km²`;
    toggleDemo1Button.textContent = demo1Running ? "Stop" : "Start";
    toggleDemo2Button.textContent = demo2Running ? "Stop" : "Start";
  }

  function stepParameter(delta) {
    state.p = clamp(state.p + delta, pLimits.min, pLimits.max);
    updateReadouts();
  }

  function stepEmissions(delta) {
    climateState.emissions = clamp(
      climateState.emissions + delta,
      emissionsLimits.min,
      emissionsLimits.max
    );
    updateReadouts();
  }

  function animate(now) {
    const elapsed = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    let remaining = elapsed;
    if (demo1Running) {
      while (remaining > 0) {
        const stepDt = Math.min(dt, remaining);
        integrateStep(stepDt);
        remaining -= stepDt;
      }
    }

    let climateRemaining = elapsed;
    if (demo2Running) {
      while (climateRemaining > 0) {
        const stepDt = Math.min(climateDt, climateRemaining * 5);
        integrateClimateStep(stepDt);
        climateRemaining -= stepDt / 5;
      }
    }

    updateReadouts();
    drawRhsPlot();
    drawTimeSeriesPlot();
    drawClimateTimeSeries();
    drawIceAnimation(now / 1000);
    requestAnimationFrame(animate);
  }

  decreaseButton.addEventListener("click", () => stepParameter(-pStep));
  increaseButton.addEventListener("click", () => stepParameter(pStep));
  resetButton.addEventListener("click", () => {
    state = createInitialState(-0.25);
    lastFrame = performance.now();
    updateReadouts();
    drawRhsPlot();
    drawTimeSeriesPlot();
  });
  toggleDemo1Button.addEventListener("click", () => {
    demo1Running = !demo1Running;
    updateReadouts();
  });
  decreaseEmissionsButton.addEventListener("click", () => stepEmissions(-emissionsStep));
  increaseEmissionsButton.addEventListener("click", () => stepEmissions(emissionsStep));
  resetClimateButton.addEventListener("click", () => {
    climateState = createClimateInitialState();
    updateReadouts();
    drawClimateTimeSeries();
    drawIceAnimation(performance.now() / 1000);
  });
  toggleDemo2Button.addEventListener("click", () => {
    demo2Running = !demo2Running;
    updateReadouts();
  });

  updateReadouts();
  drawRhsPlot();
  drawTimeSeriesPlot();
  drawClimateTimeSeries();
  drawIceAnimation(performance.now() / 1000);
  requestAnimationFrame(animate);
})();
