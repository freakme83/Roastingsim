import {
  DEFAULT_MACHINE_PROFILE,
  type BeanProfile,
  type MachineProfile,
  ROR_WINDOW_SECONDS,
} from "./config";

export type RoastState = "idle" | "charged" | "roasting" | "dropped";

export interface RoastDataPoint {
  time: number;
  bt: number;
  et: number;
  ror: number;
  gasPower: number;
  airflowEnabled: boolean;
}

export interface RoastEngineOptions {
  machine?: MachineProfile;
  bean: BeanProfile;
  initialEt?: number;
  initialBt?: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

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
    const heatInput = ((this.et - this.bt) * this.machine.beanHeatAbsorption * airflowFactor * scaledDelta) / beanResistance;
    const heatLoss =
      (this.bt - this.machine.ambientTemperature) * this.machine.beanHeatLossFactor * (1 + Number(this.airflowEnabled) * 0.35) * scaledDelta;

    this.bt = clamp(this.bt + heatInput - heatLoss, this.machine.ambientTemperature, this.machine.maxBT);

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
