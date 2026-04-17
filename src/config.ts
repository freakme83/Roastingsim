export interface MachineProfile {
  maxBT: number;
  maxET: number;
  drumSpeed: number;
  airflowEfficiency: number;
  thermalInertiaSeconds: number;
  ambientTemperature: number;
  gasToEtGain: number;
  etCoolingFactor: number;
  beanHeatAbsorption: number;
  beanHeatLossFactor: number;
}

export interface BeanProfile {
  id: string;
  label: string;
  density: number;
  moisture: number;
  firstCrackTemp: number;
  secondCrackTemp: number;
  colorMilestones: {
    yellow: number;
    cinnamon: number;
    brown: number;
    dark: number;
  };
}

export const DEFAULT_MACHINE_PROFILE: MachineProfile = {
  maxBT: 250,
  maxET: 300,
  drumSpeed: 58,
  airflowEfficiency: 0.82,
  thermalInertiaSeconds: 7,
  ambientTemperature: 24,
  gasToEtGain: 0.18,
  etCoolingFactor: 0.015,
  beanHeatAbsorption: 0.011,
  beanHeatLossFactor: 0.004,
};

export const BEAN_LIBRARY: Record<string, BeanProfile> = {
  brazilLowDensity: {
    id: "brazilLowDensity",
    label: "Brazil (Low Density)",
    density: 0.62,
    moisture: 0.11,
    firstCrackTemp: 195,
    secondCrackTemp: 223,
    colorMilestones: {
      yellow: 150,
      cinnamon: 170,
      brown: 188,
      dark: 210,
    },
  },
  kenyaHighDensity: {
    id: "kenyaHighDensity",
    label: "Kenya (High Density)",
    density: 0.76,
    moisture: 0.105,
    firstCrackTemp: 198,
    secondCrackTemp: 226,
    colorMilestones: {
      yellow: 152,
      cinnamon: 173,
      brown: 191,
      dark: 213,
    },
  },
};

export const ROR_WINDOW_SECONDS = 30;
