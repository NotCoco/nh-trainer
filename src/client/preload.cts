import { contextBridge, ipcRenderer } from "electron";
import type {
  ClientShellFrameConfig,
  ClientViewTraceSummary,
  DefaultPolicyReadResult,
  NhTrainerBridge,
  SimFixtureSummary
} from "./bridge";

const bridge: NhTrainerBridge = {
  appName: "NH Trainer",
  sourceOfTruth: "reference-client",
  listSimFixtures: () => ipcRenderer.invoke("fixtures:list-sim") as Promise<readonly SimFixtureSummary[]>,
  readSimFixture: (fileName: string) => ipcRenderer.invoke("fixtures:read-sim", fileName) as Promise<unknown>,
  listCapturedClientViewTraces: () =>
    ipcRenderer.invoke("reference:list-client-view") as Promise<readonly ClientViewTraceSummary[]>,
  readCapturedClientViewTrace: (fileName: string) =>
    ipcRenderer.invoke("reference:read-client-view", fileName) as Promise<unknown>,
  readDefaultPolicy: () =>
    ipcRenderer.invoke("policy:read-default") as Promise<DefaultPolicyReadResult>,
  applyClientShellFrameConfig: (config: ClientShellFrameConfig) =>
    ipcRenderer.invoke("client-shell:apply-frame-config", config) as Promise<void>
};

contextBridge.exposeInMainWorld("nhTrainer", bridge);
