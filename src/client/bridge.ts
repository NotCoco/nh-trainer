export interface SimFixtureSummary {
  readonly fileName: string;
  readonly fixtureId: string;
  readonly description: string;
}

export interface ClientViewTraceSummary {
  readonly fileName: string;
  readonly fixtureId: string;
  readonly description: string;
}

export interface DefaultPolicyReadResult {
  readonly path: string;
  readonly text: string;
  readonly source: "electron-bridge" | "static-fallback";
  readonly bytes?: number;
  readonly mtimeMs?: number;
}

export interface ClientShellFrameConfig {
  readonly title: string;
  readonly alwaysOnTop: boolean;
  readonly resizable: boolean;
  readonly rememberScreenBounds: boolean;
}

export interface KronosTrainerBridge {
  readonly appName: "NH Trainer";
  readonly sourceOfTruth: "reference-client";
  readonly listSimFixtures: () => Promise<readonly SimFixtureSummary[]>;
  readonly readSimFixture: (fileName: string) => Promise<unknown>;
  readonly listCapturedClientViewTraces: () => Promise<readonly ClientViewTraceSummary[]>;
  readonly readCapturedClientViewTrace: (fileName: string) => Promise<unknown>;
  readonly readDefaultPolicy: () => Promise<DefaultPolicyReadResult>;
  readonly applyClientShellFrameConfig: (config: ClientShellFrameConfig) => Promise<void>;
}
