import type { KronosTrainerBridge } from "./bridge";

declare global {
  interface Window {
    readonly kronosTrainer?: KronosTrainerBridge;
  }
}

export {};
