const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const [, , projectRoot, screenshotPath] = process.argv;
const clientUiAtlas = JSON.parse(fs.readFileSync(path.join(projectRoot, "fixtures", "render", "sprites", "client_ui.json"), "utf8"));
const mapSceneAtlas = JSON.parse(fs.readFileSync(path.join(projectRoot, "fixtures", "render", "sprites", "minimap_map_scenes.json"), "utf8"));
const mapIconAtlas = JSON.parse(fs.readFileSync(path.join(projectRoot, "fixtures", "render", "sprites", "minimap_map_icons.json"), "utf8"));
const fixedMinimapMaskSprite = clientUiAtlas.sprites.find((sprite) => sprite.alias === "fixed_mode_minimap_alpha_mask");
if (!fixedMinimapMaskSprite) {
  throw new Error("Missing fixed_mode_minimap_alpha_mask in client_ui atlas");
}
const mapSceneAliasList = mapSceneAtlas.sprites.map((sprite) => sprite.alias);
const mapSceneAliases = new Set(mapSceneAliasList);
if (!mapSceneAliases.has("map_scene_0") || !mapSceneAliases.has("map_scene_1") || mapSceneAtlas.sprites.length <= 2) {
  throw new Error(`Unexpected exported minimap map-scene sprites: ${JSON.stringify(mapSceneAliasList)}`);
}
if (!mapIconAtlas.sprites.some((sprite) => sprite.alias === "map_icon_area_0" && sprite.areaId === 0)) {
  throw new Error("Missing area-keyed minimap map icon sprite 0");
}
const rejectedMaskRow = fixedMinimapMaskSprite.maskXStarts.findIndex(
  (xStart, y) => xStart > 0 || fixedMinimapMaskSprite.maskXWidths[y] < fixedMinimapMaskSprite.width
);
if (rejectedMaskRow < 0) {
  throw new Error("Unable to derive a rejected fixed minimap SpriteMask row");
}
const rejectedMaskX = fixedMinimapMaskSprite.maskXStarts[rejectedMaskRow] > 0
  ? fixedMinimapMaskSprite.maskXStarts[rejectedMaskRow] - 1
  : fixedMinimapMaskSprite.maskXStarts[rejectedMaskRow] + fixedMinimapMaskSprite.maskXWidths[rejectedMaskRow] + 1;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady(window) {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    const status = await window.webContents.executeJavaScript(`
      (() => {
        const root = document.querySelector('section[aria-labelledby="runtime-scene"]');
        const ready = root?.querySelector(".glbStatus-ready");
        const error = root?.querySelector(".glbStatus-error, .glbStatus-missing");
        return {
          ready: ready?.textContent ?? "",
          error: error?.textContent ?? ""
        };
      })()
    `);

    if (status.ready) {
      return status.ready;
    }
    if (status.error) {
      throw new Error(status.error);
    }
    await delay(250);
  }

  throw new Error("Timed out waiting for runtime scene readiness.");
}

async function selectRuntimeReplay(window, replayId) {
  const result = await window.webContents.executeJavaScript(`
    (() => {
      const select = document.querySelector("#runtime-replay");
      if (!select) {
        return { ok: false, error: "missing runtime replay selector" };
      }
      const option = Array.from(select.options).find((candidate) => candidate.value === ${JSON.stringify(replayId)});
      if (!option) {
        return {
          ok: false,
          error: "missing replay option",
          options: Array.from(select.options).map((candidate) => candidate.value)
        };
      }
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  await delay(150);
}

async function setRuntimeCycle(window, cycle) {
  await window.webContents.executeJavaScript(`
    (() => {
      window.dispatchEvent(new CustomEvent("kronos-runtime-cycle", {
        detail: { cycle: ${JSON.stringify(cycle)} }
      }));
    })()
  `);
  await delay(120);
}

async function setRuntimeCamera(window, camera) {
  await window.webContents.executeJavaScript(`
    (() => {
      window.dispatchEvent(new CustomEvent("kronos-runtime-camera", {
        detail: { camera: ${JSON.stringify(camera)} }
      }));
    })()
  `);
  await delay(180);
}

async function readRuntimeMinimap(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const root = document.querySelector(".kronosMinimapOverlay");
      if (!root) {
        return { ok: false, error: "missing minimap overlay" };
      }
      const rootStyle = getComputedStyle(root);
      const sceneSprite = root.querySelector(".kronosMinimapSceneSprite");
      const sceneStyle = sceneSprite ? getComputedStyle(sceneSprite) : null;
      const sceneCell = sceneSprite?.querySelector(".kronosMinimapSceneCell");
      const sceneOverlayPixel = sceneSprite?.querySelector(".kronosMinimapSceneOverlayPixel");
      const sceneSegment = sceneSprite?.querySelector(".kronosMinimapSceneSegment");
      const sceneMapScene = sceneSprite?.querySelector(".kronosMinimapSceneMapScene");
      const disabledFill = root.querySelector(".kronosMinimapDisabledFill");
      const sceneCellStyle = sceneCell ? getComputedStyle(sceneCell) : null;
      const sceneOverlayPixelStyle = sceneOverlayPixel ? getComputedStyle(sceneOverlayPixel) : null;
      const sceneSegmentStyle = sceneSegment ? getComputedStyle(sceneSegment) : null;
      const sceneMapSceneStyle = sceneMapScene ? getComputedStyle(sceneMapScene) : null;
      const readDot = (dot) => {
        if (!dot) {
          return null;
        }
        const style = getComputedStyle(dot);
        const numberAttr = (name) => dot.hasAttribute(name) ? Number(dot.getAttribute(name)) : null;
        return {
          actorId: dot.getAttribute("data-actor-id") ?? "",
          dotKind: dot.getAttribute("data-dot-kind") ?? "",
          markerKind: dot.getAttribute("data-marker-kind") ?? "",
          sourceShape: dot.getAttribute("data-source-shape") ?? "",
          sourceColor: numberAttr("data-source-color"),
          sourceWidth: numberAttr("data-source-width"),
          sourceHeight: numberAttr("data-source-height"),
          sourceSpriteIndex: dot.getAttribute("data-source-sprite-index") ?? "",
          mapIconId: numberAttr("data-map-icon-id"),
          objectId: numberAttr("data-object-id"),
          sourceAreaId: numberAttr("data-source-area-id"),
          spriteAlias: dot.getAttribute("data-sprite-alias") ?? "",
          spriteFrame: dot.getAttribute("data-sprite-frame") ?? "",
          destinationX: numberAttr("data-destination-x"),
          destinationZ: numberAttr("data-destination-z"),
          distanceSquared: numberAttr("data-distance-squared"),
          clipped: dot.getAttribute("data-clipped") ?? "",
          rotatedX: numberAttr("data-rotated-x"),
          rotatedY: numberAttr("data-rotated-y"),
          left: Number.parseInt(style.left, 10),
          top: Number.parseInt(style.top, 10),
          width: Number.parseInt(style.width, 10),
          height: Number.parseInt(style.height, 10),
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          backgroundPosition: style.backgroundPosition,
          backgroundSize: style.backgroundSize
        };
      };
      return {
        ok: true,
        root: {
          cameraYaw: Number(root.getAttribute("data-camera-yaw")),
          minimapState: root.getAttribute("data-minimap-state") === "" ? null : Number(root.getAttribute("data-minimap-state")),
          minimapDisabled: root.getAttribute("data-minimap-disabled") ?? "",
          maskSpriteId: root.getAttribute("data-mask-sprite-id") ?? "",
          maskSpriteAlias: root.getAttribute("data-mask-sprite-alias") ?? "",
          maskVisualSource: root.getAttribute("data-mask-visual-source") ?? "",
          maskRowCount: Number(root.getAttribute("data-mask-row-count")),
          maskWidthCount: Number(root.getAttribute("data-mask-width-count")),
          left: rootStyle.left,
          top: rootStyle.top,
          width: rootStyle.width,
          height: rootStyle.height,
          maskImage: rootStyle.webkitMaskImage || rootStyle.maskImage || "",
          maskPosition: rootStyle.webkitMaskPosition || rootStyle.maskPosition || "",
          maskSize: rootStyle.webkitMaskSize || rootStyle.maskSize || "",
          fallbackDotCount: root.querySelectorAll(".kronosMinimapDot-fallback").length
        },
        disabledFill: disabledFill ? {
          sourceShape: disabledFill.getAttribute("data-source-shape") ?? "",
          backgroundColor: getComputedStyle(disabledFill).backgroundColor,
          width: Number.parseInt(getComputedStyle(disabledFill).width, 10),
          height: Number.parseInt(getComputedStyle(disabledFill).height, 10)
        } : null,
        scene: sceneSprite ? {
          cellCount: Number(sceneSprite.getAttribute("data-scene-cell-count")),
          overlayPixelCount: Number(sceneSprite.getAttribute("data-scene-overlay-pixel-count")),
          overlayPixelDomCount: sceneSprite.querySelectorAll(".kronosMinimapSceneOverlayPixel").length,
          segmentCount: Number(sceneSprite.getAttribute("data-scene-segment-count")),
          mapSceneDomCount: sceneSprite.querySelectorAll(".kronosMinimapSceneMapScene").length,
          mapSceneObjectCount: Number(sceneSprite.getAttribute("data-scene-mapscene-object-count")),
          mapIconObjectCount: Number(sceneSprite.getAttribute("data-scene-mapicon-object-count")),
          colorMode: sceneSprite.getAttribute("data-scene-color-mode") ?? "",
          originWorldX: Number(sceneSprite.getAttribute("data-origin-world-x")),
          originWorldY: Number(sceneSprite.getAttribute("data-origin-world-y")),
          centerX: Number(sceneSprite.getAttribute("data-scene-center-x")),
          centerY: Number(sceneSprite.getAttribute("data-scene-center-y")),
          angleDegrees: Number(sceneSprite.getAttribute("data-scene-angle-degrees")),
          left: sceneStyle?.left ?? "",
          top: sceneStyle?.top ?? "",
          width: sceneStyle?.width ?? "",
          height: sceneStyle?.height ?? "",
          transformOrigin: sceneStyle?.transformOrigin ?? "",
          transform: sceneStyle?.transform ?? "",
          sampleCell: sceneCell ? {
            worldX: Number(sceneCell.getAttribute("data-world-x")),
            worldY: Number(sceneCell.getAttribute("data-world-y")),
            backgroundColor: sceneCellStyle?.backgroundColor ?? "",
            width: sceneCellStyle?.width ?? "",
            height: sceneCellStyle?.height ?? ""
          } : null,
          sampleOverlayPixel: sceneOverlayPixel ? {
            worldX: Number(sceneOverlayPixel.getAttribute("data-world-x")),
            worldY: Number(sceneOverlayPixel.getAttribute("data-world-y")),
            underlayId: Number(sceneOverlayPixel.getAttribute("data-underlay-id")),
            overlayId: Number(sceneOverlayPixel.getAttribute("data-overlay-id")),
            tileShape: Number(sceneOverlayPixel.getAttribute("data-tile-shape")),
            tileRotation: Number(sceneOverlayPixel.getAttribute("data-tile-rotation")),
            maskIndex: Number(sceneOverlayPixel.getAttribute("data-mask-index")),
            left: sceneOverlayPixelStyle?.left ?? "",
            top: sceneOverlayPixelStyle?.top ?? "",
            width: sceneOverlayPixelStyle?.width ?? "",
            height: sceneOverlayPixelStyle?.height ?? "",
            backgroundColor: sceneOverlayPixelStyle?.backgroundColor ?? ""
          } : null,
          sampleSegment: sceneSegment ? {
            objectId: Number(sceneSegment.getAttribute("data-object-id")),
            objectType: Number(sceneSegment.getAttribute("data-object-type")),
            backgroundColor: sceneSegmentStyle?.backgroundColor ?? "",
            width: sceneSegmentStyle?.width ?? "",
            height: sceneSegmentStyle?.height ?? ""
          } : null,
          sampleMapScene: sceneMapScene ? {
            objectId: Number(sceneMapScene.getAttribute("data-object-id")),
            objectType: Number(sceneMapScene.getAttribute("data-object-type")),
            mapSceneId: Number(sceneMapScene.getAttribute("data-map-scene-id")),
            spriteAlias: sceneMapScene.getAttribute("data-sprite-alias") ?? "",
            spriteFrame: sceneMapScene.getAttribute("data-sprite-frame") ?? "",
            left: sceneMapSceneStyle?.left ?? "",
            top: sceneMapSceneStyle?.top ?? "",
            width: sceneMapSceneStyle?.width ?? "",
            height: sceneMapSceneStyle?.height ?? "",
            backgroundImage: sceneMapSceneStyle?.backgroundImage ?? "",
            backgroundPosition: sceneMapSceneStyle?.backgroundPosition ?? ""
          } : null
        } : null,
        local: readDot(root.querySelector(".kronosMinimapLocalPlayer")),
        mapIcons: Array.from(root.querySelectorAll(".kronosMinimapMapIcon")).map(readDot),
        dots: Array.from(root.querySelectorAll(".kronosMinimapDot")).map(readDot),
        markers: Array.from(root.querySelectorAll(".kronosMinimapMarker")).map(readDot)
      };
    })()
  `);
}

async function clickMinimap(window, clickX, clickY) {
  const result = await window.webContents.executeJavaScript(`
    (() => {
      const root = document.querySelector(".kronosMinimapOverlay");
      if (!root) {
        return { ok: false, error: "missing minimap overlay" };
      }
      root.scrollIntoView({ block: "center", inline: "center" });
      const rect = root.getBoundingClientRect();
      const clientX = rect.left + (${JSON.stringify(clickX)} / 145) * rect.width;
      const clientY = rect.top + (${JSON.stringify(clickY)} / 151) * rect.height;
      const hit = document.elementFromPoint(clientX, clientY);
      const target = hit && root.contains(hit) ? hit : root;
      const EventCtor = window.PointerEvent ?? window.MouseEvent;
      target.dispatchEvent(new EventCtor("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX,
        clientY,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true
      }));
      return {
        ok: true,
        clientX,
        clientY,
        lastClickX: root.getAttribute("data-last-click-x"),
        lastClickY: root.getAttribute("data-last-click-y"),
        lastClickTileX: root.getAttribute("data-last-click-tile-x"),
        lastClickTileZ: root.getAttribute("data-last-click-tile-z"),
        hitClassName: hit?.className ?? "",
        hitInsideRoot: Boolean(hit && root.contains(hit))
      };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  await delay(150);
  return result;
}

async function clearMinimapClickDataset(window) {
  await window.webContents.executeJavaScript(`
    (() => {
      const root = document.querySelector(".kronosMinimapOverlay");
      root?.removeAttribute("data-last-click-x");
      root?.removeAttribute("data-last-click-y");
      root?.removeAttribute("data-last-click-tile-x");
      root?.removeAttribute("data-last-click-tile-z");
    })()
  `);
}

async function readRuntimeControlState(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const cross = document.querySelector(".kronosClickCross");
      const crossStyle = cross ? getComputedStyle(cross) : null;
      const crossNumberAttr = (name) => cross?.hasAttribute(name) ? Number(cross.getAttribute(name)) : null;
      const poseTexts = Array.from(document.querySelectorAll(".runtimePoseList code")).map((node) => node.textContent ?? "");
      const localText = poseTexts.find((text) => text.startsWith("local-player:")) ?? "";
      const match = localText.match(/, ([a-z_]+) @ \\((-?[0-9.]+), (-?[0-9.]+)\\)$/);
      return {
        cross: cross ? {
          color: cross.getAttribute("data-color") ?? "",
          frame: cross.getAttribute("data-frame") ?? "",
          sourceSpriteId: crossNumberAttr("data-source-sprite-id"),
          sourceMouseCrossColor: crossNumberAttr("data-source-mouse-cross-color"),
          sourceFrame: crossNumberAttr("data-source-frame"),
          sourceDrawOffset: crossNumberAttr("data-source-draw-offset"),
          sourceSpriteWidth: crossNumberAttr("data-source-sprite-width"),
          sourceSpriteHeight: crossNumberAttr("data-source-sprite-height"),
          sourceSpriteOffsetX: crossNumberAttr("data-source-sprite-offset-x"),
          sourceSpriteOffsetY: crossNumberAttr("data-source-sprite-offset-y"),
          left: crossStyle.left,
          top: crossStyle.top,
          width: Number.parseInt(crossStyle.width, 10),
          height: Number.parseInt(crossStyle.height, 10),
          backgroundImage: crossStyle.backgroundImage,
          backgroundPosition: crossStyle.backgroundPosition,
          backgroundSize: crossStyle.backgroundSize
        } : null,
        localPose: match ? {
          text: localText,
          sequence: match[1],
          x: Number(match[2]),
          z: Number(match[3])
        } : { text: localText, sequence: "", x: null, z: null }
      };
    })()
  `);
}

function isRuntimeMovementSequence(sequence) {
  return sequence === "walk" ||
    sequence === "run" ||
    sequence.endsWith("_walk") ||
    sequence.endsWith("_run");
}

async function waitForRuntimeMovementState(window, beforePose, timeoutMs = 1600) {
  const deadline = Date.now() + timeoutMs;
  let latest = await readRuntimeControlState(window);
  while (Date.now() < deadline) {
    if (
      isRuntimeMovementSequence(latest.localPose.sequence) &&
      (
        latest.localPose.x !== beforePose.x ||
        latest.localPose.z !== beforePose.z
      )
    ) {
      return latest;
    }
    await delay(40);
    latest = await readRuntimeControlState(window);
  }
  return latest;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function findOpponent(snapshot) {
  return snapshot.dots.find((dot) => dot.actorId === "opponent");
}

function findDot(snapshot, actorId) {
  return snapshot.dots.find((dot) => dot.actorId === actorId);
}

function findDestinationMarker(snapshot) {
  return snapshot.markers.find((marker) => marker.markerKind === "destination");
}

function findHintMarker(snapshot) {
  return snapshot.markers.find((marker) => marker.markerKind === "hint");
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      backgroundThrottling: false,
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    const runtimeReadyMessage = await window.loadFile(path.join(projectRoot, "dist", "index.html")).then(() => waitForReady(window));
    await selectRuntimeReplay(window, "generated-nh-duel-v1");
    await setRuntimeCycle(window, 0);
    const initial = await readRuntimeMinimap(window);
    assert(initial.ok, JSON.stringify(initial));
    assert(
      initial.root.left === "570px" &&
        initial.root.top === "9px" &&
        initial.root.width === "145px" &&
        initial.root.height === "151px",
      `minimap overlay did not use the resolved fixed minimap widget: ${JSON.stringify(initial.root)}`
    );
    assert(
      initial.root.maskSpriteId === "1183" &&
        initial.root.maskSpriteAlias === "fixed_mode_minimap_alpha_mask" &&
        initial.root.maskVisualSource === "sprite-mask-rows" &&
        initial.root.maskRowCount === 151 &&
        initial.root.maskWidthCount === 151 &&
        initial.root.fallbackDotCount === 0 &&
        initial.root.maskImage.includes("data:image/svg+xml") &&
        initial.root.maskPosition === "0px 0px" &&
        initial.root.maskSize === "145px 151px",
      `minimap overlay should be clipped by the exported fixed-mode SpriteMask rows: ${JSON.stringify(initial.root)}`
    );
    assert(
      initial.scene &&
        initial.scene.cellCount === 702 &&
        initial.scene.overlayPixelCount === 425 &&
        initial.scene.overlayPixelDomCount === 425 &&
        initial.scene.segmentCount === 5 &&
        initial.scene.mapSceneDomCount === 6 &&
        initial.scene.mapSceneObjectCount === 6 &&
        initial.scene.mapIconObjectCount === 0 &&
        initial.scene.colorMode === "client-palette" &&
        initial.scene.originWorldX === 3103 &&
        initial.scene.originWorldY === 3532 &&
        initial.scene.width === "512px" &&
        initial.scene.height === "512px" &&
        initial.scene.sampleCell?.width === "4px" &&
        initial.scene.sampleCell?.height === "4px" &&
        initial.scene.sampleOverlayPixel?.worldX === 3090 &&
        initial.scene.sampleOverlayPixel?.worldY === 3521 &&
        initial.scene.sampleOverlayPixel?.underlayId === 64 &&
        initial.scene.sampleOverlayPixel?.overlayId === 42 &&
        initial.scene.sampleOverlayPixel?.tileShape === 7 &&
        initial.scene.sampleOverlayPixel?.tileRotation === 1 &&
        initial.scene.sampleOverlayPixel?.maskIndex === 12 &&
        initial.scene.sampleOverlayPixel?.left === "204px" &&
        initial.scene.sampleOverlayPixel?.top === "296px" &&
        initial.scene.sampleOverlayPixel?.width === "1px" &&
        initial.scene.sampleOverlayPixel?.height === "1px" &&
        initial.scene.sampleOverlayPixel?.backgroundColor === "rgb(84, 68, 26)" &&
        initial.scene.sampleSegment?.backgroundColor === "rgb(238, 0, 0)" &&
        initial.scene.sampleMapScene?.mapSceneId === 0 &&
        initial.scene.sampleMapScene?.spriteAlias === "map_scene_0" &&
        initial.scene.sampleMapScene?.spriteFrame === "0" &&
        initial.scene.sampleMapScene?.left === "260px" &&
        initial.scene.sampleMapScene?.top === "244px" &&
        initial.scene.sampleMapScene?.width === "8px" &&
        initial.scene.sampleMapScene?.height === "8px" &&
        initial.scene.sampleMapScene?.backgroundImage.includes("minimap_map_scenes.png"),
      `minimap scene sprite should render cache-backed terrain cells, TileModel overlay pixels, and object strokes: ${JSON.stringify(initial.scene)}`
    );
    assert(initial.local.actorId === "local-player", `local player dot actor mismatch: ${JSON.stringify(initial.local)}`);
    assert(initial.local.left === 71 && initial.local.top === 74, `local player dot position mismatch: ${JSON.stringify(initial.local)}`);
    assert(initial.local.width === 3 && initial.local.height === 3, `local player dot size mismatch: ${JSON.stringify(initial.local)}`);
    assert(
      initial.local.sourceShape === "Rasterizer2D.fillRectangle" &&
        initial.local.sourceColor === 16777215 &&
        initial.local.sourceWidth === 3 &&
        initial.local.sourceHeight === 3 &&
        initial.local.backgroundColor === "rgb(255, 255, 255)",
      `local player dot should expose the source fillRectangle(3, 3, 16777215) contract: ${JSON.stringify(initial.local)}`
    );
    const initialOpponent = findOpponent(initial);
    assert(initialOpponent, `missing opponent minimap dot: ${JSON.stringify(initial)}`);
    assert(initial.markers.length === 0, `destination marker should be absent before movement: ${JSON.stringify(initial.markers)}`);
    assert(initialOpponent.sourceSpriteIndex === "2", `opponent should use class17.mapDotSprites[2]: ${JSON.stringify(initialOpponent)}`);
    assert(initialOpponent.spriteAlias === "map_dot_player", `opponent should render the exported map_dot_player sprite: ${JSON.stringify(initialOpponent)}`);
    assert(initialOpponent.spriteFrame === "2", `opponent should render frame 2 from minimap_map_dots: ${JSON.stringify(initialOpponent)}`);
    assert(initialOpponent.width === 4 && initialOpponent.height === 5, `opponent dot size mismatch: ${JSON.stringify(initialOpponent)}`);
    assert(
      initialOpponent.backgroundImage.includes("minimap_map_dots.png"),
      `opponent dot should use the exported minimap map-dot atlas: ${JSON.stringify(initialOpponent)}`
    );
    assert(
      initialOpponent.left >= 0 &&
        initialOpponent.left < 145 &&
        initialOpponent.top >= 0 &&
        initialOpponent.top < 151 &&
        initialOpponent.distanceSquared > 0,
      `opponent dot should be inside the minimap mask: ${JSON.stringify(initialOpponent)}`
    );

    await setRuntimeCamera(window, "north");
    const north = await readRuntimeMinimap(window);
    await setRuntimeCamera(window, "south");
    const south = await readRuntimeMinimap(window);
    const northOpponent = findOpponent(north);
    const southOpponent = findOpponent(south);
    assert(north.root.cameraYaw === 0, `north minimap yaw mismatch: ${JSON.stringify(north.root)}`);
    assert(south.root.cameraYaw === 1024, `south minimap yaw mismatch: ${JSON.stringify(south.root)}`);
    assert(north.scene?.angleDegrees === 0, `north minimap scene sprite angle mismatch: ${JSON.stringify(north.scene)}`);
    assert(south.scene?.angleDegrees === 180, `south minimap scene sprite angle mismatch: ${JSON.stringify(south.scene)}`);
    assert(northOpponent && southOpponent, `missing camera comparison dots: ${JSON.stringify({ north, south })}`);
    assert(
      northOpponent.left !== southOpponent.left || northOpponent.top !== southOpponent.top,
      `opponent dot should rotate when camera yaw changes: ${JSON.stringify({ northOpponent, southOpponent })}`
    );

    await setRuntimeCamera(window, "north");
    const beforeClick = await readRuntimeControlState(window);
    assert(
      typeof beforeClick.localPose.x === "number" && typeof beforeClick.localPose.z === "number",
      `unable to read initial local actor pose before minimap click: ${JSON.stringify(beforeClick)}`
    );
    const rejectedMinimapClick = await clickMinimap(window, rejectedMaskX, rejectedMaskRow);
    assert(
      rejectedMinimapClick.lastClickX === null &&
        rejectedMinimapClick.lastClickY === null &&
        rejectedMinimapClick.lastClickTileX === null &&
        rejectedMinimapClick.lastClickTileZ === null,
      `inside-rectangle minimap click outside SpriteMask rows should not dispatch: ${JSON.stringify({
        rejectedMaskX,
        rejectedMaskRow,
        rejectedMinimapClick
      })}`
    );
    const minimapClick = await clickMinimap(window, 76, 75);
    assert(minimapClick.hitInsideRoot, `minimap click should hit inside the overlay: ${JSON.stringify(minimapClick)}`);
    assert(
      Number(minimapClick.lastClickX) === 76 &&
        Number(minimapClick.lastClickY) === 75 &&
        Number(minimapClick.lastClickTileX) === beforeClick.localPose.x + 1 &&
        Number(minimapClick.lastClickTileZ) === beforeClick.localPose.z,
      `north-facing minimap east click should dispatch one tile east: ${JSON.stringify({ beforeClick, minimapClick })}`
    );
    const afterClick = await readRuntimeControlState(window);
    assert(afterClick.cross?.color === "yellow", `minimap click should show the yellow movement cross: ${JSON.stringify(afterClick)}`);
    assert(
      afterClick.cross.backgroundImage.includes("click_cross.png"),
      `minimap click should use the exported click-cross sprite sheet: ${JSON.stringify(afterClick)}`
    );
    assert(
      afterClick.cross.sourceMouseCrossColor === 1 &&
        afterClick.cross.sourceFrame === Number(afterClick.cross.frame) &&
        afterClick.cross.sourceSpriteId === 515 + afterClick.cross.sourceFrame &&
        afterClick.cross.sourceDrawOffset === 8 &&
        afterClick.cross.width === afterClick.cross.sourceSpriteWidth &&
        afterClick.cross.height === afterClick.cross.sourceSpriteHeight &&
        afterClick.cross.sourceSpriteOffsetX !== null &&
        afterClick.cross.sourceSpriteOffsetY !== null,
      `movement cross should expose the client mouseCrossColor and source sprite frame: ${JSON.stringify(afterClick.cross)}`
    );
    const movementState = await waitForRuntimeMovementState(window, beforeClick.localPose);
    assert(
      isRuntimeMovementSequence(movementState.localPose.sequence),
      `minimap click should route the local actor with a movement sequence: ${JSON.stringify(movementState)}`
    );
    const afterClickMinimap = await readRuntimeMinimap(window);
    const destinationMarker = findDestinationMarker(afterClickMinimap);
    assert(destinationMarker, `minimap click should render a destination marker: ${JSON.stringify(afterClickMinimap)}`);
    assert(
      destinationMarker.spriteAlias === "map_marker_destination" &&
        destinationMarker.sourceSpriteIndex === "0" &&
        destinationMarker.spriteFrame === "0",
      `destination marker should use GameObject.mapMarkerSprites[0]: ${JSON.stringify(destinationMarker)}`
    );
    assert(
      destinationMarker.destinationX === Number(minimapClick.lastClickTileX) &&
        destinationMarker.destinationZ === Number(minimapClick.lastClickTileZ) &&
        destinationMarker.width === 8 &&
        destinationMarker.height === 15 &&
        destinationMarker.backgroundImage.includes("minimap_map_markers.png"),
      `destination marker should use the exported marker atlas at the clicked tile: ${JSON.stringify(destinationMarker)}`
    );
    await delay(1100);
    const afterRoute = await readRuntimeControlState(window);
    assert(
      movementState.localPose.x > beforeClick.localPose.x &&
        movementState.localPose.x < afterRoute.localPose.x &&
        afterRoute.localPose.x > beforeClick.localPose.x &&
        Math.abs(movementState.localPose.z - beforeClick.localPose.z) < 0.001 &&
        Math.abs(afterRoute.localPose.z - beforeClick.localPose.z) < 0.001,
      `north-facing minimap east click should queue movement and only advance the logical tile after the client reaches the routed tile: ${JSON.stringify({ beforeClick, minimapClick, movementState, afterRoute })}`
    );
    assert(afterRoute.localPose.sequence === "wand_ready", `local actor should return to the Kronos weapon-ready pose after the routed minimap step: ${JSON.stringify(afterRoute)}`);

    await selectRuntimeReplay(window, "generated-minimap-semantics-v1");
    await setRuntimeCycle(window, 0);
    await setRuntimeCamera(window, "north");
    const semantic = await readRuntimeMinimap(window);
    const npcDot = findDot(semantic, "npc-source");
    const itemDot = findDot(semantic, "ground-item-source");
    const friendsChatDot = findOpponent(semantic);
    const hintMarker = findHintMarker(semantic);
    const mapIcon = semantic.mapIcons.find((icon) => icon.mapIconId === 0 && icon.objectId === 12345);
    assert(semantic.root.fallbackDotCount === 0, `semantic minimap should not render handmade fallback dots: ${JSON.stringify(semantic.root)}`);
    assert(semantic.root.cameraYaw === 512, `semantic minimap should use captured client-view camera yaw: ${JSON.stringify(semantic.root)}`);
    assert(
      mapIcon?.sourceAreaId === 0 &&
        mapIcon.spriteAlias === "map_icon_area_0" &&
        mapIcon.backgroundImage.includes("minimap_map_icons.png"),
      `client-view map-icon source should render Decimator.method2498(mapIconId).method4369(false) atlas sprite: ${JSON.stringify({ mapIcon, semantic })}`
    );
    assert(
      npcDot?.dotKind === "npc" &&
        npcDot.sourceSpriteIndex === "1" &&
        npcDot.spriteAlias === "map_dot_npc" &&
        npcDot.spriteFrame === "1" &&
        npcDot.backgroundImage.includes("minimap_map_dots.png"),
      `NPC minimap source should render class17.mapDotSprites[1]: ${JSON.stringify({ npcDot, semantic })}`
    );
    assert(
      itemDot?.dotKind === "item" &&
        itemDot.sourceSpriteIndex === "0" &&
        itemDot.spriteAlias === "map_dot_item" &&
        itemDot.spriteFrame === "0" &&
        itemDot.backgroundImage.includes("minimap_map_dots.png"),
      `item minimap source should render class17.mapDotSprites[0]: ${JSON.stringify({ itemDot, semantic })}`
    );
    assert(
      friendsChatDot?.dotKind === "friends-chat" &&
        friendsChatDot.sourceSpriteIndex === "5" &&
        friendsChatDot.spriteAlias === "map_dot_friends_chat" &&
        friendsChatDot.spriteFrame === "5" &&
        friendsChatDot.backgroundImage.includes("minimap_map_dots.png"),
      `friends-chat player minimap source should render class17.mapDotSprites[5]: ${JSON.stringify({ friendsChatDot, semantic })}`
    );
    assert(
      hintMarker?.markerKind === "hint" &&
        hintMarker.sourceSpriteIndex === "1" &&
        hintMarker.spriteAlias === "map_marker_hint" &&
        hintMarker.spriteFrame === "1" &&
        hintMarker.width === 15 &&
        hintMarker.height === 15 &&
        hintMarker.backgroundImage.includes("minimap_map_markers.png"),
      `hint minimap source should render GameObject.mapMarkerSprites[1]: ${JSON.stringify({ hintMarker, semantic })}`
    );

    await selectRuntimeReplay(window, "generated-disabled-minimap-v1");
    await setRuntimeCycle(window, 0);
    const disabled = await readRuntimeMinimap(window);
    assert(
      disabled.root.minimapState === 2 &&
        disabled.root.minimapDisabled === "true" &&
        disabled.disabledFill?.sourceShape === "Rasterizer2D.method6430" &&
        disabled.disabledFill.backgroundColor === "rgb(0, 0, 0)" &&
        disabled.disabledFill.width === 145 &&
        disabled.disabledFill.height === 151,
      `disabled minimap state should draw only the SpriteMask-clipped Rasterizer2D.method6430 fill: ${JSON.stringify(disabled)}`
    );
    assert(
      !disabled.scene &&
        !disabled.local &&
        disabled.mapIcons.length === 0 &&
        disabled.dots.length === 0 &&
        disabled.markers.length === 0,
      `disabled minimap state should suppress scene, map icons, dots, markers, and local fillRectangle: ${JSON.stringify(disabled)}`
    );
    await clearMinimapClickDataset(window);
    const disabledClick = await clickMinimap(window, 76, 75);
    assert(
      disabledClick.lastClickX === null &&
        disabledClick.lastClickY === null &&
        disabledClick.lastClickTileX === null &&
        disabledClick.lastClickTileZ === null,
      `disabled minimap state should not dispatch minimap clicks: ${JSON.stringify(disabledClick)}`
    );

    if (screenshotPath) {
      const captureRect = await window.webContents.executeJavaScript(`
        (() => {
          const root = document.querySelector(".kronosMinimapOverlay");
          if (!root) {
            return null;
          }
          root.scrollIntoView({ block: "center", inline: "center" });
          const rect = root.getBoundingClientRect();
          return {
            x: Math.max(0, Math.floor(rect.left - 12)),
            y: Math.max(0, Math.floor(rect.top - 12)),
            width: Math.ceil(rect.width + 24),
            height: Math.ceil(rect.height + 24)
          };
        })()
      `);
      assert(captureRect, "missing minimap overlay capture rect");
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      const screenshot = await window.webContents.capturePage(captureRect);
      fs.writeFileSync(screenshotPath, screenshot.toPNG());
    }

    console.log(
      JSON.stringify(
        {
          runtimeReadyMessage,
          initial,
          north,
          south,
          rejectedMaskClick: {
            x: rejectedMaskX,
            y: rejectedMaskRow,
            result: rejectedMinimapClick
          },
          minimapClick,
          afterClick,
          afterClickMinimap,
          afterRoute,
          semantic,
          screenshotPath
        },
        null,
        2
      )
    );
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
