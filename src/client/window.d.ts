import type { NhTrainerBridge } from "./bridge";

declare global {
  interface Window {
    readonly nhTrainer?: NhTrainerBridge;
  }
}

export {};
