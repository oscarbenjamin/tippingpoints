(function () {
  const rhsCanvas = document.getElementById("rhs-canvas");
  const rhsCtx = rhsCanvas.getContext("2d");
  const timeCanvas = document.getElementById("timeseries-canvas");
  const timeCtx = timeCanvas.getContext("2d");

  const pValueEl = document.getElementById("p-value");
  const xValueEl = document.getElementById("x-value");
  const decreaseButton = document.getElementById("decrease-p");
  const increaseButton = document.getElementById("increase-p");
  const resetButton = document.getElementById("reset-system");

  const xDomain = { min: -1.8, max: 1.8 };
  const rhsRange = { min: -2.4, max: 2.4 };
  const historyDuration = 28;
  const dt = 0.02;
  const pStep = 0.035;
  const pLimits = { min: -0.65, max: 0.65 };

  let state = createInitialState(-0.25);
  let lastFrame = performance.now();

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

  function updateReadouts() {
    pValueEl.textContent = state.p.toFixed(3);
    xValueEl.textContent = state.x.toFixed(3);
  }

  function stepParameter(delta) {
    state.p = clamp(state.p + delta, pLimits.min, pLimits.max);
    updateReadouts();
  }

  function animate(now) {
    const elapsed = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    let remaining = elapsed;
    while (remaining > 0) {
      const stepDt = Math.min(dt, remaining);
      integrateStep(stepDt);
      remaining -= stepDt;
    }

    updateReadouts();
    drawRhsPlot();
    drawTimeSeriesPlot();
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

  updateReadouts();
  drawRhsPlot();
  drawTimeSeriesPlot();
  requestAnimationFrame(animate);
})();
