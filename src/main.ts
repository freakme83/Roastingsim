import "./style.css";
import { RoastEngine, type RoastDataPoint, type RoastPhase } from "./RoastEngine";
import { BEAN_LIBRARY } from "./config";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("#app root element not found");
}

app.innerHTML = `
  <div class="panel">
    <h1>Coffee Roasting Simulator</h1>
    <small>Interactive roast controls, live profile chart, and drum visualizer.</small>
  </div>

  <div class="panel controls" id="controls">
    <h2>Control Panel</h2>
    <label class="control-row" for="gasPower">
      <span>Gas Power</span>
      <input id="gasPower" type="range" min="0" max="100" value="60" step="1" />
      <strong id="gasValue">60%</strong>
    </label>

    <label class="control-row checkbox" for="airflowToggle">
      <input id="airflowToggle" type="checkbox" />
      <span>Airflow Enabled</span>
      <strong id="airflowValue">OFF</strong>
    </label>

    <div class="control-row">
      <button id="dropBtn" type="button">Drop Roast</button>
    </div>
  </div>

  <div class="panel metrics" id="metrics"></div>

  <div class="panel">
    <h2>Roast Profile</h2>
    <canvas id="profileChart" width="920" height="320"></canvas>
  </div>

  <div class="panel">
    <h2>Drum Visualizer</h2>
    <canvas id="drumCanvas" width="320" height="320"></canvas>
  </div>
`;

const metricsEl = document.querySelector<HTMLDivElement>("#metrics");
const gasSlider = document.querySelector<HTMLInputElement>("#gasPower");
const gasValueEl = document.querySelector<HTMLElement>("#gasValue");
const airflowToggle = document.querySelector<HTMLInputElement>("#airflowToggle");
const airflowValueEl = document.querySelector<HTMLElement>("#airflowValue");
const dropBtn = document.querySelector<HTMLButtonElement>("#dropBtn");
const profileCanvas = document.querySelector<HTMLCanvasElement>("#profileChart");
const drumCanvas = document.querySelector<HTMLCanvasElement>("#drumCanvas");

if (!metricsEl || !gasSlider || !gasValueEl || !airflowToggle || !airflowValueEl || !dropBtn || !profileCanvas || !drumCanvas) {
  throw new Error("Required UI elements not found");
}

const profileCtx = profileCanvas.getContext("2d");
const drumCtx = drumCanvas.getContext("2d");

if (!profileCtx || !drumCtx) {
  throw new Error("Canvas contexts unavailable");
}

const engine = new RoastEngine({ bean: BEAN_LIBRARY.kenyaHighDensity });
engine.charge();

const chartData: RoastDataPoint[] = [];
const phaseTransitions: Array<{ time: number; phase: RoastPhase }> = [];
let previousPhase: RoastPhase | null = null;
const MAX_POINTS = 2400;
const CHART_DURATION_SECONDS = 600;

interface DrumBean {
  angle: number;
  radius: number;
  speed: number;
  wobble: number;
  size: number;
}

const beans: DrumBean[] = Array.from({ length: 80 }, () => ({
  angle: Math.random() * Math.PI * 2,
  radius: Math.random() * 0.82,
  speed: 0.8 + Math.random() * 1.8,
  wobble: 1 + Math.random() * 3,
  size: 2 + Math.random() * 2.8,
}));

const format = (value: number) => value.toFixed(2);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const pushChartPoint = (point: RoastDataPoint) => {
  chartData.push(point);
  if (chartData.length > MAX_POINTS) {
    chartData.shift();
  }

  if (previousPhase !== point.phase) {
    phaseTransitions.push({ time: point.time, phase: point.phase });
    previousPhase = point.phase;
  }

  while (phaseTransitions.length > 0 && phaseTransitions[0].time < point.time - CHART_DURATION_SECONDS) {
    phaseTransitions.shift();
  }
};

const drawProfileChart = (now: RoastDataPoint) => {
  const width = profileCanvas.width;
  const height = profileCanvas.height;
  const padding = { left: 48, right: 16, top: 14, bottom: 24 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  profileCtx.clearRect(0, 0, width, height);
  profileCtx.fillStyle = "#0b1220";
  profileCtx.fillRect(0, 0, width, height);

  profileCtx.strokeStyle = "rgba(255,255,255,0.12)";
  profileCtx.lineWidth = 1;
  profileCtx.beginPath();
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (plotHeight / 4) * i;
    profileCtx.moveTo(padding.left, y);
    profileCtx.lineTo(width - padding.right, y);
  }
  profileCtx.stroke();

  const startTime = Math.max(0, now.time - CHART_DURATION_SECONDS);
  const endTime = startTime + CHART_DURATION_SECONDS;

  const toX = (time: number) => padding.left + ((time - startTime) / CHART_DURATION_SECONDS) * plotWidth;
  const btMin = 20;
  const btMax = 240;
  const rorMin = -10;
  const rorMax = 45;

  const toYBt = (bt: number) => padding.top + (1 - (clamp(bt, btMin, btMax) - btMin) / (btMax - btMin)) * plotHeight;
  const toYRoR = (ror: number) =>
    padding.top + (1 - (clamp(ror, rorMin, rorMax) - rorMin) / (rorMax - rorMin)) * plotHeight;

  profileCtx.save();
  profileCtx.setLineDash([5, 5]);
  profileCtx.strokeStyle = "rgba(255,255,255,0.35)";
  profileCtx.lineWidth = 1;
  for (const marker of phaseTransitions) {
    if (marker.time < startTime || marker.time > endTime) {
      continue;
    }

    const x = toX(marker.time);
    profileCtx.beginPath();
    profileCtx.moveTo(x, padding.top);
    profileCtx.lineTo(x, height - padding.bottom);
    profileCtx.stroke();
  }
  profileCtx.restore();

  const visible = chartData.filter((point) => point.time >= startTime);

  if (visible.length >= 2) {
    profileCtx.lineWidth = 2;
    profileCtx.strokeStyle = "#b7410e";
    profileCtx.beginPath();
    visible.forEach((point, index) => {
      const x = toX(point.time);
      const y = toYBt(point.bt);
      if (index === 0) {
        profileCtx.moveTo(x, y);
      } else {
        profileCtx.lineTo(x, y);
      }
    });
    profileCtx.stroke();

    profileCtx.strokeStyle = "#16c784";
    profileCtx.beginPath();
    visible.forEach((point, index) => {
      const x = toX(point.time);
      const y = toYRoR(point.ror);
      if (index === 0) {
        profileCtx.moveTo(x, y);
      } else {
        profileCtx.lineTo(x, y);
      }
    });
    profileCtx.stroke();
  }

  profileCtx.fillStyle = "#cbd5e1";
  profileCtx.font = "12px Inter, sans-serif";
  profileCtx.fillText(`Time: ${Math.round(now.time)}s`, padding.left, height - 6);
  profileCtx.fillText("BT", width - 86, 16);
  profileCtx.fillStyle = "#16c784";
  profileCtx.fillText("RoR", width - 50, 16);
};

const drawDrum = (now: RoastDataPoint) => {
  const width = drumCanvas.width;
  const height = drumCanvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const drumRadius = Math.min(width, height) * 0.44;

  drumCtx.clearRect(0, 0, width, height);
  drumCtx.fillStyle = "#0f172a";
  drumCtx.fillRect(0, 0, width, height);

  drumCtx.strokeStyle = "#94a3b8";
  drumCtx.lineWidth = 4;
  drumCtx.beginPath();
  drumCtx.arc(cx, cy, drumRadius, 0, Math.PI * 2);
  drumCtx.stroke();

  const beanColor = engine.getBeanColor();
  const tumbleDirection = airflowToggle.checked ? 1.25 : 1;

  drumCtx.fillStyle = beanColor;
  for (const bean of beans) {
    const tumbleAngle = bean.angle + now.time * bean.speed * tumbleDirection;
    const wobble = 0.03 * Math.sin(now.time * bean.wobble + bean.angle);
    const radial = clamp(bean.radius + wobble, 0.03, 0.9) * drumRadius;

    const x = cx + Math.cos(tumbleAngle) * radial;
    const y = cy + Math.sin(tumbleAngle * 1.15) * radial * 0.72;

    drumCtx.beginPath();
    drumCtx.arc(x, y, bean.size, 0, Math.PI * 2);
    drumCtx.fill();
  }
};

const renderStats = (snapshot: RoastDataPoint) => {
  const beanColor = engine.getBeanColor();
  metricsEl.innerHTML = `
    <div><strong>State</strong><br/>${engine.getState()}</div>
    <div><strong>Phase</strong><br/>${snapshot.phase}</div>
    <div><strong>Gas</strong><br/>${Math.round(snapshot.gasPower * 100)}%</div>
    <div><strong>Airflow</strong><br/>${snapshot.airflowEnabled ? "ON" : "OFF"}</div>
    <div><strong>Time (s)</strong><br/>${format(snapshot.time)}</div>
    <div><strong>BT (°C)</strong><br/>${format(snapshot.bt)}</div>
    <div><strong>ET (°C)</strong><br/>${format(snapshot.et)}</div>
    <div><strong>RoR (°C/min)</strong><br/>${format(snapshot.ror)}</div>
    <div>
      <strong>Bean Color</strong><br/>
      <span class="color-chip" style="background-color:${beanColor};"></span>
      <span>${beanColor}</span>
    </div>
  `;
};

const syncControlsFromSnapshot = (snapshot: RoastDataPoint) => {
  gasValueEl.textContent = `${Math.round(snapshot.gasPower * 100)}%`;
  airflowValueEl.textContent = snapshot.airflowEnabled ? "ON" : "OFF";
  dropBtn.disabled = engine.getState() === "dropped";
};

gasSlider.addEventListener("input", () => {
  const gasPercent = Number(gasSlider.value);
  engine.setGasPower(gasPercent / 100);
  gasValueEl.textContent = `${gasPercent}%`;
});

airflowToggle.addEventListener("change", () => {
  engine.setAirflow(airflowToggle.checked);
  airflowValueEl.textContent = airflowToggle.checked ? "ON" : "OFF";
});

dropBtn.addEventListener("click", () => {
  engine.drop();
  dropBtn.disabled = true;
});

let lastTs = performance.now();
const fixedTimeScale = 1;

const loop = (ts: number) => {
  const deltaTime = (ts - lastTs) / 1000;
  lastTs = ts;

  const nextPoint = engine.tick(deltaTime, fixedTimeScale) ?? engine.getCurrentSnapshot();
  pushChartPoint(nextPoint);
  syncControlsFromSnapshot(nextPoint);
  renderStats(nextPoint);
  drawProfileChart(nextPoint);
  drawDrum(nextPoint);

  requestAnimationFrame(loop);
};

const initial = engine.getCurrentSnapshot();
pushChartPoint(initial);
syncControlsFromSnapshot(initial);
renderStats(initial);
drawProfileChart(initial);
drawDrum(initial);
requestAnimationFrame(loop);
