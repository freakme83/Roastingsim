import "./style.css";
import { RoastEngine } from "./RoastEngine";
import { BEAN_LIBRARY } from "./config";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("#app root element not found");
}

app.innerHTML = `
  <div class="panel">
    <h1>Coffee Roasting Simulator (Physics Engine Scaffold)</h1>
    <small>Engine initialized with deltaTime + time scale support (1x / 2x / 4x ready).</small>
  </div>
  <div class="panel metrics" id="metrics"></div>
`;

const metricsEl = document.querySelector<HTMLDivElement>("#metrics");
if (!metricsEl) {
  throw new Error("#metrics element not found");
}

const engine = new RoastEngine({ bean: BEAN_LIBRARY.kenyaHighDensity });
engine.charge();

let lastTs = performance.now();
let timeScale = 1;
let elapsed = 0;

const format = (value: number) => value.toFixed(2);

const render = () => {
  const snapshot = engine.getCurrentSnapshot();
  metricsEl.innerHTML = `
    <div><strong>State</strong><br/>${engine.getState()}</div>
    <div><strong>Time (s)</strong><br/>${format(snapshot.time)}</div>
    <div><strong>BT (°C)</strong><br/>${format(snapshot.bt)}</div>
    <div><strong>ET (°C)</strong><br/>${format(snapshot.et)}</div>
    <div><strong>RoR (°C/min)</strong><br/>${format(snapshot.ror)}</div>
    <div><strong>Scale</strong><br/>${timeScale}x</div>
  `;
};

const loop = (ts: number) => {
  const deltaTime = (ts - lastTs) / 1000;
  lastTs = ts;

  elapsed += deltaTime;
  if (elapsed > 10) {
    timeScale = timeScale === 4 ? 1 : timeScale * 2;
    elapsed = 0;
  }

  engine.tick(deltaTime, timeScale);
  render();
  requestAnimationFrame(loop);
};

render();
requestAnimationFrame(loop);
