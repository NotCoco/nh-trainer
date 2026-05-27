import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(projectRoot, "scripts", "runtime-overlay-validation-electron.cjs");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function verifyRuntimeOverlayCameraProjectionPath() {
  const runtimeSource = readFileSync(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
  const signatureStart = runtimeSource.indexOf("function runtimeDomOverlayStructureSignature");
  const signatureEnd = runtimeSource.indexOf("function applyRuntimeDomOverlayElementStyle", signatureStart);
  assert(signatureStart >= 0 && signatureEnd > signatureStart, "missing runtime DOM overlay structure signature path");
  const signatureBody = runtimeSource.slice(signatureStart, signatureEnd);
  assert(
    !signatureBody.includes("overlay.left") && !signatureBody.includes("overlay.top"),
    "DOM overlay structure signature must not include camera-projected left/top; camera movement should update imperatively per frame"
  );
  assert(
    runtimeSource.includes("applyRuntimeDomOverlayElementStyles(\n        nextDomOverlays,\n        boundary.fixedClientCssLayout,\n        runtimeDomOverlayElementsRef.current"),
    "render loop must apply camera-projected DOM overlay positions every frame"
  );
  assert(
    runtimeSource.includes("nhOverlayClientViewportProjection(") &&
      runtimeSource.includes("nhRuntimeOverlayClientCameraState(boundary)") &&
      (
        runtimeSource.includes("advanceRuntimeCameraClientCycle(boundary, cameraKeysRef.current)") ||
        runtimeSource.includes("advanceRuntimeCameraAnglesClientCycle(boundary, cameraKeysRef.current)")
      ) &&
      runtimeSource.includes("updateRuntimeCamera(boundary)"),
    "DOM overlays must be projected through the same Nh client viewportTempX/Y path during camera-key motion"
  );
  assert(
    runtimeSource.includes("style={runtimeDomOverlayStaticStyle(overlay)}") &&
      runtimeSource.includes("function runtimeDomOverlayStaticStyle") &&
      runtimeSource.includes("React owns the sprite structure only; the render frame applies the live projected transform."),
    "React must not re-apply stale camera transforms while the Nh-style render frame owns live DOM overlay projection"
  );
  assert(
    runtimeSource.includes("function nhActorOverlayCssPixel") &&
      runtimeSource.includes("Sprite.method6159(int, int)") &&
      runtimeSource.includes("rounding here makes overhead sprites drift during camera-key motion") &&
      runtimeSource.includes("return value;") &&
      !runtimeSource.includes("Math.round(value)"),
    "actor DOM overlays must preserve source-projected viewport pixels through fixed-client CSS scaling instead of post-scale rounding"
  );
}

function readCssBlock(cssSource, selector) {
  const start = cssSource.indexOf(`${selector} {`);
  assert(start >= 0, `missing CSS block for ${selector}`);
  const end = cssSource.indexOf("}", start);
  assert(end > start, `unterminated CSS block for ${selector}`);
  return cssSource.slice(start, end + 1);
}

function cssZIndex(cssBlock, selector) {
  const match = cssBlock.match(/z-index:\s*(\d+)\s*;/);
  assert(match, `missing z-index in ${selector}`);
  return Number(match[1]);
}

function verifyRuntimeOverlayLayering() {
  const runtimeSource = readFileSync(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
  const cssSource = readFileSync(path.join(projectRoot, "src", "ui", "styles.css"), "utf8");
  const hudZ = cssZIndex(readCssBlock(cssSource, ".nhClientHud"), ".nhClientHud");
  const sceneOverlayZ = cssZIndex(readCssBlock(cssSource, ".nhSceneOverlayLayer"), ".nhSceneOverlayLayer");
  const contextMenuZ = cssZIndex(readCssBlock(cssSource, ".nhContextMenu"), ".nhContextMenu");
  const statusOrbZ = cssZIndex(readCssBlock(cssSource, ".runeliteStatusOrbOverlay"), ".runeliteStatusOrbOverlay");

  assert(
    sceneOverlayZ < hudZ,
    "scene viewport overlays must be below the fixed client HUD so actor skulls/hitsplats cannot cover inventory or chat"
  );
  assert(
    contextMenuZ > hudZ && statusOrbZ > hudZ,
    "screen-space UI overlays must stay above the fixed HUD after the scene overlay layer is isolated"
  );
  assert(
    runtimeSource.includes("function runtimeSceneOverlayLayerStyle") &&
      runtimeSource.includes("clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px)`") &&
      runtimeSource.includes("const viewport = layout.viewportRect;"),
    "scene overlay layer must clip projected world overlays to the fixed viewport rectangle"
  );

  const firstSceneLayerStart = runtimeSource.indexOf('data-source-layer="Scene.copy$drawActor2d viewport overlay pass"');
  const firstSceneLayerEnd = runtimeSource.indexOf('data-source-layer="XpDropPlugin above-opponent viewport overlay pass"', firstSceneLayerStart);
  assert(firstSceneLayerStart >= 0 && firstSceneLayerEnd > firstSceneLayerStart, "missing source-shaped scene overlay layer");
  const firstSceneLayer = runtimeSource.slice(firstSceneLayerStart, firstSceneLayerEnd);
  assert(
    firstSceneLayer.includes("runtimeDomOverlays.map((overlay)") &&
      firstSceneLayer.includes("runelitePrayAgainstPlayerOverlays.map((overlay)") &&
      firstSceneLayer.includes("runelitePrayerBarOverlay ?"),
    "actor overheads and projected game-world overlays must be mounted inside the scene overlay stacking layer"
  );
  assert(
    runtimeSource.includes('data-source-layer="Client.drawMouseCross viewport overlay pass"') &&
      runtimeSource.includes("className=\"nhClickCross\""),
    "click cross must be treated as viewport content rather than fixed screen UI"
  );
}

async function main() {
  verifyRuntimeOverlayCameraProjectionPath();
  verifyRuntimeOverlayLayering();

  const child = spawn(electronPath, [validatorPath, projectRoot], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise((resolve) => {
    child.on("close", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`runtime overlay validation failed with code ${exitCode}\n${stderr}\n${stdout}`);
  }

  process.stdout.write(stdout);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
