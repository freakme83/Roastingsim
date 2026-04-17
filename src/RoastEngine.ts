import {
  DEFAULT_MACHINE_PROFILE,
  type BeanProfile,
  type MachineProfile,
  ROR_WINDOW_SECONDS,
} from "./config";

export type RoastState = "idle" | "charged" | "roasting" | "dropped";
export type RoastPhase = "DRYING" | "MAILLARD" | "FIRST_CRACK" | "DEVELOPMENT";

export interface RoastDataPoint {
  time: number;
  bt: number;
  et: number;
  ror: number;
  gasPower: number;
  airflowEnabled: boolean;
  phase: RoastPhase;
}

export interface RoastEngineOptions {
  machine?: MachineProfile;
  bean: BeanProfile;
  initialEt?: number;
  initialBt?: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const lerp = (start: number, end: number, t: number): number => start + (end - start) * t;

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const normalized = hex.replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
};

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }): string => {
  const toHex = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export class RoastEngine {
  private readonly machine: MachineProfile;
  private readonly bean: BeanProfile;

  private state: RoastState = "idle";
  private bt: number;
  private et: number;
  private timeSeconds = 0;
  private gasPower = 0.6;
  private airflowEnabled = false;

  private readonly gasHistory: Array<{ time: number; value: number }> = [];
  private readonly btHistory: Array<{ time: number; value: number }> = [];
  private readonly etHistory: Array<{ time: number; value: number }> = [];

  constructor(options: RoastEngineOptions) {
    this.machine = options.machine ?? DEFAULT_MACHINE_PROFILE;
    this.bean = options.bean;
    this.et = options.initialEt ?? 200;
    this.bt = options.initialBt ?? this.machine.ambientTemperature;
  }

  public charge(): void {
    this.state = "charged";
    this.timeSeconds = 0;
    this.bt = this.machine.ambientTemperature;
    this.gasHistory.length = 0;
    this.btHistory.length = 0;
    this.etHistory.length = 0;

    this.pushSample();
  }

  public drop(): void {
    this.state = "dropped";
  }

  public setGasPower(percent: number): void {
    this.gasPower = clamp(percent, 0, 1);
  }

  public setAirflow(enabled: boolean): void {
    this.airflowEnabled = enabled;
  }

  public getRoastPhase(): RoastPhase {
    if (this.bt < 150) {
      return "DRYING";
    }

    if (this.bt < this.bean.firstCrackTemp) {
      return "MAILLARD";
    }

    if (this.bt < this.bean.firstCrackTemp + 15) {
      return "FIRST_CRACK";
    }

    return "DEVELOPMENT";
  }

  public getBeanColor(): string {
    const palette = {
      green: "#7a9b62",
      yellow: "#d9b64a",
      cinnamon: "#b56a3b",
      brown: "#7b4a2c",
      dark: "#3f2518",
      black: "#1f1713",
    };

    const milestones = this.bean.colorMilestones;
    const stops: Array<{ temp: number; color: string }> = [
      { temp: this.machine.ambientTemperature, color: palette.green },
      { temp: milestones.yellow, color: palette.yellow },
      { temp: milestones.cinnamon, color: palette.cinnamon },
      { temp: milestones.brown, color: palette.brown },
      { temp: milestones.dark, color: palette.dark },
      { temp: this.machine.maxBT, color: palette.black },
    ];

    if (this.bt <= stops[0].temp) {
      return stops[0].color;
    }

    if (this.bt >= stops[stops.length - 1].temp) {
      return stops[stops.length - 1].color;
    }

    for (let i = 0; i < stops.length - 1; i += 1) {
      const start = stops[i];
      const end = stops[i + 1];

      if (this.bt >= start.temp && this.bt <= end.temp) {
        const t = clamp((this.bt - start.temp) / Math.max(end.temp - start.temp, 1e-6), 0, 1);
        const startRgb = hexToRgb(start.color);
        const endRgb = hexToRgb(end.color);

        return rgbToHex({
          r: lerp(startRgb.r, endRgb.r, t),
          g: lerp(startRgb.g, endRgb.g, t),
          b: lerp(startRgb.b, endRgb.b, t),
        });
      }
    }

    return palette.dark;
  }

  public tick(deltaTimeSeconds: number, timeScale = 1): RoastDataPoint | null {
    if (this.state === "idle" || this.state === "dropped") {
      return null;
    }

    const scaledDelta = Math.max(0, deltaTimeSeconds) * clamp(timeScale, 1, 4);
    this.timeSeconds += scaledDelta;

    const delayedGas = this.getDelayedGasPower();
    const airflowFactor = this.airflowEnabled
      ? this.machine.airflowEfficiency
      : 1 - (1 - this.machine.airflowEfficiency) * 0.4;

    const etHeatInput = delayedGas * this.machine.gasToEtGain * scaledDelta;
    const etHeatLoss =
      (this.et - this.machine.ambientTemperature) *
      this.machine.etCoolingFactor *
      (2 - airflowFactor) *
      scaledDelta;
    this.et = clamp(this.et + etHeatInput - etHeatLoss, this.machine.ambientTemperature, this.machine.maxET);

    const beanResistance = 1 + this.bean.density + this.bean.moisture;
    const heatInput =
      ((this.et - this.bt) * this.machine.beanHeatAbsorption * airflowFactor * scaledDelta) / beanResistance;

    const crackStart = this.bean.firstCrackTemp;
    const crackEnd = crackStart + 15;
    const inCrackWindow = this.bt >= crackStart && this.bt < crackEnd;
    const crackProgress = clamp((this.bt - crackStart) / Math.max(crackEnd - crackStart, 1e-6), 0, 1);
    const exothermicCurve = 1 - crackProgress;
    const exothermicBoost = inCrackWindow
      ? this.machine.exothermicPower * (0.35 + delayedGas * 0.65) * exothermicCurve * scaledDelta
      : 0;

    const heatLoss =
      (this.bt - this.machine.ambientTemperature) *
      this.machine.beanHeatLossFactor *
      (1 + Number(this.airflowEnabled) * 0.35) *
      scaledDelta;

    this.bt = clamp(this.bt + heatInput + exothermicBoost - heatLoss, this.machine.ambientTemperature, this.machine.maxBT);

    if (this.state === "charged" && this.timeSeconds >= 1) {
      this.state = "roasting";
    }

    this.pushSample();

    return {
      time: this.timeSeconds,
      bt: this.bt,
      et: this.et,
      ror: this.calculateRoR(),
      gasPower: this.gasPower,
      airflowEnabled: this.airflowEnabled,
      phase: this.getRoastPhase(),
    };
  }

  public getState(): RoastState {
    return this.state;
  }

  public getTimeSeconds(): number {
    return this.timeSeconds;
  }

  public getCurrentSnapshot(): RoastDataPoint {
    return {
      time: this.timeSeconds,
      bt: this.bt,
      et: this.et,
      ror: this.calculateRoR(),
      gasPower: this.gasPower,
      airflowEnabled: this.airflowEnabled,
      phase: this.getRoastPhase(),
    };
  }

  private pushSample(): void {
    this.gasHistory.push({ time: this.timeSeconds, value: this.gasPower });
    this.btHistory.push({ time: this.timeSeconds, value: this.bt });
    this.etHistory.push({ time: this.timeSeconds, value: this.et });

    this.trimHistory(120);
  }

  private trimHistory(secondsToKeep: number): void {
    const cutoff = this.timeSeconds - secondsToKeep;
    while (this.gasHistory.length > 1 && this.gasHistory[0].time < cutoff) {
      this.gasHistory.shift();
    }
    while (this.btHistory.length > 1 && this.btHistory[0].time < cutoff) {
      this.btHistory.shift();
    }
    while (this.etHistory.length > 1 && this.etHistory[0].time < cutoff) {
      this.etHistory.shift();
    }
  }

  private getDelayedGasPower(): number {
    const targetTime = this.timeSeconds - this.machine.thermalInertiaSeconds;
    if (targetTime <= 0 || this.gasHistory.length === 0) {
      return this.gasPower;
    }

    let candidate = this.gasHistory[0].value;
    for (const sample of this.gasHistory) {
      if (sample.time <= targetTime) {
        candidate = sample.value;
      } else {
        break;
      }
    }

    return candidate;
  }

  private calculateRoR(): number {
    if (this.btHistory.length < 2) {
      return 0;
    }

    const now = this.btHistory[this.btHistory.length - 1];
    const windowStartTime = now.time - ROR_WINDOW_SECONDS;

    let past = this.btHistory[0];
    for (const sample of this.btHistory) {
      if (sample.time <= windowStartTime) {
        past = sample;
      } else {
        break;
      }
    }

    const deltaT = Math.max(now.time - past.time, 1e-6);
    return ((now.value - past.value) / deltaT) * 60;
  }
}
