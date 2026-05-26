import { app, BrowserWindow, ipcMain, screen } from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ClientShellFrameConfig, DefaultPolicyReadResult } from "./bridge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.resolve(__dirname, "..", "fixtures");
const simFixturesRoot = path.join(fixturesRoot, "sim");
const clientReferenceRoot = path.join(fixturesRoot, "reference", "client-render");
const projectRoot = path.resolve(__dirname, "..");
const kronosRoot = path.resolve(projectRoot, "..");
const defaultPolicyPath = path.join(
  kronosRoot,
  "kronos-osrs-184-master",
  "kronos-osrs-184-master",
  "Kronos-master",
  "kronos-server",
  "data",
  "ai",
  "nhstaker-selfplay-policy-nhstake-ags.tsv"
);
const KRONOS_FIXED_CLIENT_WIDTH = 765;
const KRONOS_FIXED_CLIENT_HEIGHT = 503;
const RUNELITE_PLUGIN_TOOLBAR_WIDTH = 36;
const RUNELITE_SHELL_BORDER_PX = 0;
const RUNELITE_MIN_CONTENT_WIDTH = KRONOS_FIXED_CLIENT_WIDTH + RUNELITE_PLUGIN_TOOLBAR_WIDTH + RUNELITE_SHELL_BORDER_PX;
const RUNELITE_MIN_CONTENT_HEIGHT = KRONOS_FIXED_CLIENT_HEIGHT + RUNELITE_SHELL_BORDER_PX;
const clientWindowBoundsDirectoryName = "NHTrainer";
const clientWindowBoundsFileName = "client-window-bounds.json";
const legacyClientWindowBoundsDirectoryName = "KronosNHTrainer";
const legacyElectronUserDataDirectoryName = "Electron";

let rememberClientWindowBounds = true;

interface RememberedClientWindowBounds {
  readonly schemaVersion: 1;
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly contentBounds: {
    readonly width: number;
    readonly height: number;
  };
  readonly updatedAt: number;
}

interface SimFixtureSummary {
  readonly fileName: string;
  readonly fixtureId: string;
  readonly description: string;
}

interface ClientViewTraceSummary {
  readonly fileName: string;
  readonly fixtureId: string;
  readonly description: string;
}

interface ClientRenderReferenceManifest {
  readonly schemaVersion: number;
  readonly frames: readonly ClientRenderReferenceFrame[];
}

interface ClientRenderReferenceFrame {
  readonly clientViewTraceFileName?: string;
}

function safeJsonFixturePath(root: string, fileName: string, suffix: string, label: string): string {
  const baseName = path.basename(fileName);
  if (baseName !== fileName || !baseName.endsWith(suffix)) {
    throw new Error(`Invalid ${label} fixture name: ${fileName}`);
  }

  return path.join(root, baseName);
}

function simFixturePath(fileName: string): string {
  return safeJsonFixturePath(simFixturesRoot, fileName, ".json", "sim");
}

function clientViewTracePath(fileName: string): string {
  return safeJsonFixturePath(clientReferenceRoot, fileName, ".client-view.json", "client-view");
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(stripJsonBom(await readFile(filePath, "utf8"))) as T;
}

function stripJsonBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function readSimFixture(fileName: string): Promise<unknown> {
  return readJsonFile<unknown>(simFixturePath(fileName));
}

async function readCapturedClientViewTrace(fileName: string): Promise<unknown> {
  return readJsonFile<unknown>(clientViewTracePath(fileName));
}

function fixtureSummary(fileName: string, value: unknown): ClientViewTraceSummary {
  const fixture = value as { readonly fixtureId?: unknown; readonly description?: unknown };
  return {
    fileName,
    fixtureId: typeof fixture.fixtureId === "string" ? fixture.fixtureId : fileName.replace(/\.json$/i, ""),
    description: typeof fixture.description === "string" ? fixture.description : ""
  };
}

async function listCapturedClientViewTraceFiles(): Promise<readonly string[]> {
  let manifest: ClientRenderReferenceManifest;
  try {
    manifest = await readJsonFile<ClientRenderReferenceManifest>(path.join(clientReferenceRoot, "manifest.json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.frames)) {
    throw new Error(`Invalid client render reference manifest: ${path.join(clientReferenceRoot, "manifest.json")}`);
  }

  return [
    ...new Set(
      manifest.frames
        .map((frame) => frame.clientViewTraceFileName)
        .filter((fileName): fileName is string => typeof fileName === "string" && fileName.endsWith(".client-view.json"))
    )
  ].sort();
}

function registerFixtureIpc(): void {
  ipcMain.handle("fixtures:list-sim", async (): Promise<readonly SimFixtureSummary[]> => {
    const files = (await readdir(simFixturesRoot)).filter((file) => file.endsWith(".json")).sort();
    const summaries = await Promise.all(
      files.map(async (fileName) => fixtureSummary(fileName, await readSimFixture(fileName)))
    );
    return summaries;
  });

  ipcMain.handle("fixtures:read-sim", async (_event, fileName: string): Promise<unknown> => readSimFixture(fileName));

  ipcMain.handle("reference:list-client-view", async (): Promise<readonly ClientViewTraceSummary[]> => {
    const files = await listCapturedClientViewTraceFiles();
    return Promise.all(
      files.map(async (fileName) => fixtureSummary(fileName, await readCapturedClientViewTrace(fileName)))
    );
  });

  ipcMain.handle(
    "reference:read-client-view",
    async (_event, fileName: string): Promise<unknown> => readCapturedClientViewTrace(fileName)
  );
}

function registerPolicyIpc(): void {
  ipcMain.handle("policy:read-default", async (): Promise<DefaultPolicyReadResult> => {
    const [metadata, text] = await Promise.all([
      stat(defaultPolicyPath),
      readFile(defaultPolicyPath, "utf8")
    ]);
    return {
      path: defaultPolicyPath,
      text,
      source: "electron-bridge",
      bytes: metadata.size,
      mtimeMs: metadata.mtimeMs
    };
  });
}

function registerClientShellIpc(): void {
  ipcMain.handle("client-shell:apply-frame-config", (event, config: ClientShellFrameConfig): void => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return;
    }

    window.setTitle(config.title);
    window.setAlwaysOnTop(config.alwaysOnTop);
    window.setResizable(config.resizable);
    rememberClientWindowBounds = config.rememberScreenBounds;
    if (rememberClientWindowBounds) {
      void saveRememberedClientWindowBounds(window);
    } else {
      void clearRememberedClientWindowBounds();
    }
  });
}

async function createWindow(): Promise<void> {
  const rememberedBounds = await readRememberedClientWindowBounds();
  const window = new BrowserWindow({
    ...(rememberedBounds
      ? {
          x: rememberedBounds.bounds.x,
          y: rememberedBounds.bounds.y,
          width: rememberedBounds.contentBounds.width,
          height: rememberedBounds.contentBounds.height
        }
      : {
          width: 1280,
          height: 800
        }),
    minWidth: RUNELITE_MIN_CONTENT_WIDTH,
    minHeight: RUNELITE_MIN_CONTENT_HEIGHT,
    useContentSize: true,
    title: "NH Trainer",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  applyRuneliteMinimumContentSize(window);
  registerWindowBoundsPersistence(window);

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
    return;
  }

  void window.loadFile(path.join(__dirname, "../dist/index.html"));
}

function applyRuneliteMinimumContentSize(window: BrowserWindow): void {
  const bounds = window.getBounds();
  const contentBounds = window.getContentBounds();
  const frameWidth = Math.max(0, bounds.width - contentBounds.width);
  const frameHeight = Math.max(0, bounds.height - contentBounds.height);
  // Source: Kronos ClientPanel minimum is Constants.GAME_FIXED_SIZE (765x503);
  // ClientPluginToolbar is 36px wide. The composed trainer client has no extra inner border.
  window.setMinimumSize(RUNELITE_MIN_CONTENT_WIDTH + frameWidth, RUNELITE_MIN_CONTENT_HEIGHT + frameHeight);
}

function registerWindowBoundsPersistence(window: BrowserWindow): void {
  let saveTimer: NodeJS.Timeout | null = null;
  const scheduleSave = (): void => {
    if (!rememberClientWindowBounds) {
      return;
    }
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void saveRememberedClientWindowBounds(window);
    }, 250);
  };

  window.on("resize", scheduleSave);
  window.on("move", scheduleSave);
  window.on("close", () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (rememberClientWindowBounds) {
      saveRememberedClientWindowBoundsSync(window);
    }
  });
}

async function readRememberedClientWindowBounds(): Promise<RememberedClientWindowBounds | null> {
  const primary = await readRememberedClientWindowBoundsFromPath(clientWindowBoundsPath());
  if (primary) {
    return primary;
  }

  const legacyNamedBounds = await readRememberedClientWindowBoundsFromPath(legacyNamedClientWindowBoundsPath());
  if (legacyNamedBounds) {
    return legacyNamedBounds;
  }

  return readRememberedClientWindowBoundsFromPath(legacyClientWindowBoundsPath());
}

async function readRememberedClientWindowBoundsFromPath(filePath: string): Promise<RememberedClientWindowBounds | null> {
  let stored: unknown;
  try {
    stored = JSON.parse(stripJsonBom(await readFile(filePath, "utf8"))) as RememberedClientWindowBounds;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    console.warn("Ignoring invalid saved RuneLite client bounds", error);
    return null;
  }

  if (!isRememberedClientWindowBounds(stored) || !boundsIntersectWorkArea(stored.bounds)) {
    return null;
  }

  return {
    ...stored,
    contentBounds: {
      width: Math.max(RUNELITE_MIN_CONTENT_WIDTH, stored.contentBounds.width),
      height: Math.max(RUNELITE_MIN_CONTENT_HEIGHT, stored.contentBounds.height)
    }
  };
}

async function saveRememberedClientWindowBounds(window: BrowserWindow): Promise<void> {
  const payload = rememberedClientWindowBoundsPayload(window);
  if (!payload) {
    return;
  }

  const filePath = clientWindowBoundsPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function saveRememberedClientWindowBoundsSync(window: BrowserWindow): void {
  const payload = rememberedClientWindowBoundsPayload(window);
  if (!payload) {
    return;
  }

  const filePath = clientWindowBoundsPath();
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function rememberedClientWindowBoundsPayload(window: BrowserWindow): RememberedClientWindowBounds | null {
  if (!rememberClientWindowBounds || window.isDestroyed() || window.isMinimized() || window.isFullScreen()) {
    return null;
  }

  const bounds = window.getBounds();
  const contentBounds = window.getContentBounds();
  return {
    schemaVersion: 1,
    bounds,
    contentBounds: {
      width: Math.max(RUNELITE_MIN_CONTENT_WIDTH, contentBounds.width),
      height: Math.max(RUNELITE_MIN_CONTENT_HEIGHT, contentBounds.height)
    },
    updatedAt: Date.now()
  };
}

async function clearRememberedClientWindowBounds(): Promise<void> {
  await Promise.all(
    [clientWindowBoundsPath(), legacyNamedClientWindowBoundsPath(), legacyClientWindowBoundsPath()].map(async (filePath) => {
      try {
        await unlink(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
          console.warn("Failed to clear saved RuneLite client bounds", error);
        }
      }
    })
  );
}

function clientWindowBoundsDirectory(): string {
  return path.join(app.getPath("appData"), clientWindowBoundsDirectoryName);
}

function legacyClientWindowBoundsDirectory(): string {
  return path.join(app.getPath("appData"), legacyElectronUserDataDirectoryName);
}

function legacyNamedClientWindowBoundsDirectory(): string {
  return path.join(app.getPath("appData"), legacyClientWindowBoundsDirectoryName);
}

function legacyClientWindowBoundsPath(): string {
  return path.join(legacyClientWindowBoundsDirectory(), clientWindowBoundsFileName);
}

function legacyNamedClientWindowBoundsPath(): string {
  return path.join(legacyNamedClientWindowBoundsDirectory(), clientWindowBoundsFileName);
}

function clientWindowBoundsPath(): string {
  return path.join(clientWindowBoundsDirectory(), clientWindowBoundsFileName);
}

function isRememberedClientWindowBounds(value: unknown): value is RememberedClientWindowBounds {
  const candidate = value as RememberedClientWindowBounds;
  return (
    candidate?.schemaVersion === 1 &&
    isFiniteWindowRect(candidate.bounds) &&
    Number.isFinite(candidate.contentBounds?.width) &&
    Number.isFinite(candidate.contentBounds?.height)
  );
}

function isFiniteWindowRect(rect: RememberedClientWindowBounds["bounds"] | undefined): boolean {
  if (!rect) {
    return false;
  }
  return (
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function boundsIntersectWorkArea(bounds: RememberedClientWindowBounds["bounds"]): boolean {
  const workArea = screen.getDisplayMatching(bounds).workArea;
  return (
    bounds.x < workArea.x + workArea.width &&
    bounds.x + bounds.width > workArea.x &&
    bounds.y < workArea.y + workArea.height &&
    bounds.y + bounds.height > workArea.y
  );
}

app.whenReady().then(() => {
  registerFixtureIpc();
  registerPolicyIpc();
  registerClientShellIpc();
  void createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
