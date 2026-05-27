import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();
const { PerspectiveCamera } = require("three");

function loadTsModule(relativePath) {
  return loadModule(path.resolve(projectRoot, relativePath));
}

function loadModule(sourcePath) {
  const resolvedPath = resolveModulePath(sourcePath);
  const cached = moduleCache.get(resolvedPath);
  if (cached) {
    return cached.exports;
  }

  if (resolvedPath.endsWith(".json")) {
    const module = { exports: readJson(path.relative(projectRoot, resolvedPath)) };
    moduleCache.set(resolvedPath, module);
    return module.exports;
  }

  const source = readFileSync(resolvedPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      resolveJsonModule: true,
      target: ts.ScriptTarget.ES2020,
      strict: true
    },
    fileName: resolvedPath
  }).outputText;

  const module = { exports: {} };
  moduleCache.set(resolvedPath, module);
  vm.runInNewContext(
    transpiled,
    {
      module,
      exports: module.exports,
      require: (request) => localRequire(resolvedPath, request),
      console
    },
    { filename: resolvedPath }
  );
  return module.exports;
}

function localRequire(parentPath, request) {
  if (request.startsWith(".")) {
    return loadModule(path.resolve(path.dirname(parentPath), request));
  }
  return require(request);
}

function resolveModulePath(candidatePath) {
  const attempts = [
    candidatePath,
    `${candidatePath}.ts`,
    `${candidatePath}.tsx`,
    `${candidatePath}.js`,
    `${candidatePath}.json`,
    path.join(candidatePath, "index.ts"),
    path.join(candidatePath, "index.tsx"),
    path.join(candidatePath, "index.js")
  ];
  for (const attempt of attempts) {
    try {
      const stat = require("node:fs").statSync(attempt);
      if (stat.isFile()) {
        return attempt;
      }
    } catch {
      // Try the next module candidate.
    }
  }
  throw new Error(`Cannot resolve module ${candidatePath}`);
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(projectRoot, relativePath), "utf8"));
}

function readNhClientSource(relativePath) {
  return readFileSync(path.resolve(projectRoot, "..", "Nh184-Client", ...relativePath.split("/")), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertSourceIncludes(sourceText, snippet, sourceLabel) {
  assert(sourceText.includes(snippet), `${sourceLabel} should include ${JSON.stringify(snippet)}`);
}

function assertArrayEquals(left, right, message) {
  assert(
    left.length === right.length && left.every((value, index) => value === right[index]),
    `${message}: ${JSON.stringify({ left, right })}`
  );
}

function equipmentSlotItemIds(equipmentSlots) {
  return equipmentSlots
    .filter((slot) => Number.isInteger(slot) && slot >= 512)
    .map((slot) => slot - 512)
    .sort((left, right) => left - right);
}

function pushByte(bytes, value) {
  bytes.push(value & 0xff);
}

function pushUnsignedShort(bytes, value) {
  pushByte(bytes, value >> 8);
  pushByte(bytes, value);
}

function pushString(bytes, value) {
  for (const char of value) {
    pushByte(bytes, char.charCodeAt(0));
  }
  pushByte(bytes, 0);
}

function buildRawAppearancePacket({
  gender = 0,
  headIconPk = -1,
  headIconPrayer = -1,
  equipmentSlots,
  bodyColors,
  sequences,
  username,
  prefix = "",
  suffix = "",
  combatLevel = 126,
  skillLevel = 0,
  isHidden = false,
  npcTransformId = -1
}) {
  const bytes = [];
  pushByte(bytes, gender);
  pushByte(bytes, headIconPk);
  pushByte(bytes, headIconPrayer);

  if (npcTransformId >= 0) {
    pushUnsignedShort(bytes, 65535);
    pushUnsignedShort(bytes, npcTransformId);
  } else {
    for (const encoded of equipmentSlots) {
      if (encoded === 0) {
        pushByte(bytes, 0);
      } else {
        pushUnsignedShort(bytes, encoded);
      }
    }
  }

  for (const color of bodyColors) {
    pushByte(bytes, color);
  }

  for (const sequence of [
    sequences.ready,
    sequences.turnLeft,
    sequences.walk,
    sequences.walkBack,
    sequences.walkLeft,
    sequences.walkRight,
    sequences.run
  ]) {
    pushUnsignedShort(bytes, sequence < 0 ? 65535 : sequence);
  }

  pushString(bytes, username);
  pushString(bytes, prefix);
  pushString(bytes, suffix);
  pushByte(bytes, combatLevel);
  pushUnsignedShort(bytes, skillLevel);
  pushByte(bytes, isHidden ? 1 : 0);
  return Uint8Array.from(bytes);
}

function geometryColorArray(scene) {
  const mesh = firstMesh(scene);
  return mesh.geometry.getAttribute("color").array;
}

function sceneMaterialTransparent(scene) {
  const materials = [];
  scene.traverse?.((node) => {
    if (!node.isMesh || !node.material) {
      return;
    }
    materials.push(...(Array.isArray(node.material) ? node.material : [node.material]));
  });
  if (materials.length === 0 && scene.material) {
    materials.push(...(Array.isArray(scene.material) ? scene.material : [scene.material]));
  }
  return materials.some((material) => material.transparent);
}

function sceneHasTextureMaterial(scene, textureId) {
  return sceneMaterials(scene).some((material) => material.userData?.nhTextureId === textureId && material.map);
}

function sceneTextureGeometryUvCount(scene, textureId) {
  let uvCount = 0;
  scene.traverse?.((node) => {
    if (!node.isMesh || !node.material || !node.geometry) {
      return;
    }
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (!materials.some((material) => material.userData?.nhTextureId === textureId)) {
      return;
    }
    uvCount += node.geometry.getAttribute("uv")?.count ?? 0;
  });
  return uvCount;
}

function sceneTextureOffset(scene, textureId) {
  for (const material of sceneMaterials(scene)) {
    if (material.userData?.nhTextureId === textureId && material.map) {
      return { x: material.map.offset.x, y: material.map.offset.y };
    }
  }
  return null;
}

function sceneTextureMaterialDepthTest(scene, textureId) {
  for (const material of sceneMaterials(scene)) {
    if (material.userData?.nhTextureId === textureId) {
      return material.depthTest;
    }
  }
  return null;
}

function sceneTextureMaterialDepthWrite(scene, textureId) {
  for (const material of sceneMaterials(scene)) {
    if (material.userData?.nhTextureId === textureId) {
      return material.depthWrite;
    }
  }
  return null;
}

function sceneTextureMaterialTransparent(scene, textureId) {
  for (const material of sceneMaterials(scene)) {
    if (material.userData?.nhTextureId === textureId) {
      return material.transparent;
    }
  }
  return null;
}

function firstPainterGeometry(scene) {
  let found = null;
  scene.traverse?.((node) => {
    if (!found && node.isMesh && node.geometry?.userData?.nhPlayerPainter) {
      found = node.geometry;
    }
  });
  if (!found && scene.isMesh && scene.geometry?.userData?.nhPlayerPainter) {
    found = scene.geometry;
  }
  return found;
}

function sceneMaterials(scene) {
  const materials = [];
  scene.traverse?.((node) => {
    if (!node.isMesh || !node.material) {
      return;
    }
    materials.push(...(Array.isArray(node.material) ? node.material : [node.material]));
  });
  if (materials.length === 0 && scene.material) {
    materials.push(...(Array.isArray(scene.material) ? scene.material : [scene.material]));
  }
  return materials;
}

function firstMesh(scene) {
  if (scene.isMesh) {
    return scene;
  }
  let found = null;
  scene.traverse?.((node) => {
    if (!found && node.isMesh) {
      found = node;
    }
  });
  if (!found) {
    throw new Error("composed scene should contain a mesh");
  }
  return found;
}

function hasVisibleSourceFaceAlpha(metadata) {
  return (metadata.sourceFaceAlphas ?? []).some((alpha) => (alpha & 0xff) !== 0);
}

function colorDelta(left, right) {
  let delta = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    delta += Math.abs(left[index] - right[index]);
  }
  return delta;
}

const { composeNhPlayerModel, updateNhAnimatedTextures, updateNhPlayerModelPainterOrder } = loadTsModule("src/render/nhPlayerModel.ts");
const { runtimeLoadouts } = loadTsModule("src/render/runtimeScene.ts");
const { clientViewTraceToRuntimeReplay } = loadTsModule("src/render/clientViewReplay.ts");
const {
  createNhClientAppearancePacket,
  nhAppearanceEquipmentSlots
} = loadTsModule("src/sim/clientAppearancePacket.ts");
const {
  decodeNhPlayerAppearancePacket,
  nhRuntimeAppearanceFromDecodedPacket
} = loadTsModule("src/render/nhPlayerAppearancePacket.ts");
const {
  assertValidClientViewTrace,
  createDefaultNhDuelClientViewTrace,
  createInventorySwitchNhDuelClientViewTrace
} = loadTsModule("src/sim/index.ts");

const sources = {
  cacheItems: readJson("fixtures/assets/defs/cache-items.json"),
  kits: readJson("fixtures/assets/defs/kits.json"),
  cacheModels: readJson("fixtures/assets/models/cache-models.json"),
  serverItems: readJson("fixtures/assets/defs/server-items.json"),
  bodyColors: readJson("fixtures/assets/defs/body-colors.json"),
  textures: readJson("fixtures/assets/defs/textures.json")
};
const serverItemById = new Map(sources.serverItems.map((item) => [item.id, item]));

function isRenderableAppearanceItem(itemId) {
  const equipSlot = serverItemById.get(itemId)?.equipSlot;
  const cacheItem = sources.cacheItems[itemId];
  return (
    Number.isInteger(equipSlot) &&
    equipSlot >= 0 &&
    equipSlot < 12 &&
    ["maleModel0", "maleModel1", "maleModel2"].some((field) => Number.isInteger(cacheItem?.[field]) && cacheItem[field] >= 0)
  );
}
const summary = [];
const bodyColorPaletteLengths = sources.bodyColors.primaryPalettes.map((palette) => palette.length);

const livePlayerSource = readNhClientSource("runelite-client/src/main/java/net/runelite/standalone/Player.java");
const clientActorMovementSource = readNhClientSource("runelite-client/src/main/java/net/runelite/standalone/class329.java");
const clientModelSource = readNhClientSource("runelite-client/src/main/java/net/runelite/standalone/Model.java");
const clientModelDataSource = readNhClientSource("runelite-client/src/main/java/net/runelite/standalone/ModelData.java");
const clientPlayerAppearanceSource = readNhClientSource("runelite-client/src/main/java/net/runelite/standalone/PlayerAppearance.java");
const clientRasterizer3dSource = readNhClientSource("runelite-client/src/main/java/net/runelite/standalone/Rasterizer3D.java");
const clientTextureSource = readNhClientSource("runelite-client/src/main/java/net/runelite/standalone/Texture.java");
const clientTextureProviderSource = readNhClientSource("runelite-client/src/main/java/net/runelite/standalone/TextureProvider.java");
const clientCycleSource = readNhClientSource("runelite-client/src/main/java/net/runelite/standalone/Friend.java");
const captureClientReferenceSource = readFileSync(path.join(projectRoot, "scripts", "capture-client-reference.mjs"), "utf8");
const runtimeViewerSource = readFileSync(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
const renderParitySource = readFileSync(path.join(projectRoot, "scripts", "render-parity-electron.cjs"), "utf8");
const electronMainSource = readFileSync(path.join(projectRoot, "src", "client", "main.ts"), "utf8");
const playerModelSource = readFileSync(path.join(projectRoot, "src", "render", "nhPlayerModel.ts"), "utf8");
assertSourceIncludes(livePlayerSource, "byte[] nhNhAppearancePacket;", "Player live appearance capture");
assertSourceIncludes(
  livePlayerSource,
  "Arrays.copyOf(var1.array, var1.offset)",
  "Player live appearance capture"
);
for (const snippet of [
  "readClientViewTrace",
  "clientViewTraceFileName",
  "client-player-appearance-packet",
  "appearancePacket",
  "validateClientViewInventory",
  "validateClientViewSelectedInventoryItem",
  "validateClientViewHudState",
  "client-container-widget-update-contract",
  "clientViewTraceFileName: frame.clientViewTrace?.fileName"
]) {
  assertSourceIncludes(captureClientReferenceSource, snippet, "capture-client-reference client-view trace ingestion");
}
assertSourceIncludes(captureClientReferenceSource, "stripJsonBom", "capture-client-reference client-view trace ingestion");
for (const snippet of [
  "loadCapturedReferenceClientViewTraces",
  "reference/client-render/manifest.json",
  "listCapturedClientViewTraces",
  "readCapturedClientViewTrace",
  "isMissingCapturedTraceIpc"
]) {
  assertSourceIncludes(runtimeViewerSource, snippet, "RuntimeSceneViewer captured client-view replay loading");
}
for (const snippet of [
  "client-actor-model-origin-contract",
  "Player.getModel() as a single composed model at the actor world position",
  "instance.position.set(0, 0, 0)",
  "slot.group.rotation.y = nhActorModelRotationRadiansFromFacingDegrees(pose.facingDegrees)",
  "const orientationUnits = nhFacingDegreesToOrientationUnits(degrees);",
  "return (orientationUnits * Math.PI * 2) / NH_ACTOR_ORIENTATION_UNITS;"
]) {
  assertSourceIncludes(runtimeViewerSource, snippet, "RuntimeSceneViewer actor model origin handling");
}
assert(
  !runtimeViewerSource.includes("instance.position.set(0, floorOffsetY, 0)") &&
    !runtimeViewerSource.includes("const floorOffsetY = Number.isFinite(bounds.min.y) ? -bounds.min.y : 0;"),
  "runtime actor model wrapper must not floor-align each loadout by bounds.min.y because weapon swaps would change actor height"
);
for (const snippet of [
  "model.vertexPositionsX[vertexIndex]",
  "-model.vertexPositionsY[vertexIndex]",
  "model.vertexPositionsZ[vertexIndex]",
  "camera.projectionMatrix.elements[0] *= -1;",
  "mesh.indices.push(triangleBase, triangleBase + 1, triangleBase + 2);"
]) {
  assertSourceIncludes(
    snippet.includes("projectionMatrix") ? runtimeViewerSource : playerModelSource,
    snippet,
    "Nh player model client-coordinate basis"
  );
}
assert(
  sources.bodyColors.secondaryPalettes.slice(2).every((palette) => palette.length === 0),
  "empty secondary body color palettes should stay empty instead of becoming [0]"
);
assertSourceIncludes(
  clientActorMovementSource,
  "var0.orientation = (int)(Math.atan2((double)var12, (double)var4) * 325.949D) & 2047;",
  "Nh actor target-facing orientation"
);
assertSourceIncludes(
  clientModelSource,
  "var42 = var41 * var36 + var39 * var37 >> 16;",
  "Nh Model.draw actor orientation rotation"
);
for (const snippet of [
  "byte var33 = this.faceRenderPriorities[var11];",
  "for(var15 = 0; var15 < 10; ++var15)"
]) {
  assertSourceIncludes(clientModelSource, snippet, "Nh Model.draw face render priority order");
}
for (const snippet of [
  "preparePlayerModelParts",
  "nhPlayerFaceDrawOrder",
  "nhModelFacePriority",
  "model.priority ?? 0",
  "createPlayerAppearanceScene",
  "geometry.addGroup",
  "playerTriangleMaterialKey",
  "updateNhPlayerModelPainterOrder",
  "nhPainterTriangleOrder",
  "Nh Model.method2375 projected depth bucket ordering and face priority pass",
  "model.faceTextures?.[faceIndex]",
  "faceTextureUCoordinates",
  "render/textures/texture_${textureId}.png",
  "updateNhAnimatedTextures",
  "Nh Texture.copy$animate",
  "cache-composed-player-appearance-opaque",
  "cache-composed-player-appearance-alpha",
  "clonePlayerAppearanceGeometry",
  "playerTriangleUsesTransparentPass",
  "nhTriangleSourceIndices",
  "Browser renderer split: opaque faces stay in Three's opaque path",
  "depthTest: true",
  "depthWrite: !transparent",
  "transparent,"
]) {
  assertSourceIncludes(playerModelSource, snippet, "player model face render priority order port");
}
for (const snippet of [
  "int animationSpeed;",
  "int animationDirection;",
  "this.animationDirection = var1.readUnsignedByte();",
  "this.animationSpeed = var1.readUnsignedByte();",
  "if(this.animationDirection == 1 || this.animationDirection == 3)",
  "if(this.animationDirection == 2 || this.animationDirection == 4)"
]) {
  assertSourceIncludes(clientTextureSource, snippet, "Nh texture animation definition and software animate path");
}
for (const snippet of [
  "var3.animationDirection != 0",
  "var3.method2345(var1)"
]) {
  assertSourceIncludes(clientTextureProviderSource, snippet, "Nh TextureProvider animated texture cycle");
}
assertSourceIncludes(
  clientCycleSource,
  "((TextureProvider)Rasterizer3D.Rasterizer3D_textureLoader).method2846(Client.field906);",
  "Nh client texture animation tick"
);
for (const snippet of [
  "this.faceTextures != null && this.faceTextures[var1] != -1",
  "Rasterizer3D.method2957",
  "this.faceTextures[var1]"
]) {
  assertSourceIncludes(clientModelSource, snippet, "Nh Model textured face draw path");
}
for (const snippet of [
  "var8.faceTextures = this.faceTextures",
  "computeTextureUVCoordinates",
  "faceTextureUCoordinates",
  "faceTextureVCoordinates"
]) {
  assertSourceIncludes(clientModelDataSource, snippet, "Nh ModelData texture and UV transfer path");
}
for (const snippet of [
  "new ModelData(var16, var11)",
  "var8 = var18.method2778(64, 850, -30, -50, -30);"
]) {
  assertSourceIncludes(clientPlayerAppearanceSource, snippet, "Nh PlayerAppearance player model lighting call");
}
for (const snippet of [
  "this.method2774();",
  "this.faceRenderPriorities[this.faceCount] = var10.priority;",
  "var8.faceColors1[var16] = method2779(var15, var14);",
  "var8.faceColors3[var16] = -2;",
  "var8.faceColors1[var16] = 128;"
]) {
  assertSourceIncludes(clientModelDataSource, snippet, "Nh ModelData.method2778 lighting path");
}
for (const snippet of [
  "Rasterizer3D_colorPalette = new int[65536];",
  "method2950(var0, 0, 512);",
  "+ 0.0078125D",
  "+ 0.0625D"
]) {
  assertSourceIncludes(clientRasterizer3dSource, snippet, "Nh Rasterizer3D HSL color palette");
}
for (const snippet of [
  "RASTERIZER_3D_BRIGHTNESS = 0.9",
  "buildRasterizer3dColorPalette",
  "CLIENT_PLAYER_MODEL_CONTRAST = 850",
  "createClientPlayerSharedVertexNormals",
  "clientAdjustHslLightness",
  "const hue = (index >> 3) / 64 + 0.0078125",
  "const saturation = (index & 7) / 8 + 0.0625"
]) {
  assertSourceIncludes(playerModelSource, snippet, "player model Rasterizer3D color palette port");
}
assert(
  !runtimeViewerSource.includes("instance.position.set(-center.x"),
  "runtime actor model wrapper must not recenter player meshes around bounding-box X before yaw"
);
assert(
  !runtimeViewerSource.includes("-center.z);\n  wrapper.scale.setScalar(scale);"),
  "runtime actor model wrapper must not recenter player meshes around bounding-box Z before yaw"
);
assertSourceIncludes(
  runtimeViewerSource,
  "loadJson<NonNullable<NhPlayerModelSources[\"textures\"]>>(\"assets/defs/textures.json\")",
  "RuntimeSceneViewer player model texture metadata loading"
);
assertSourceIncludes(
  runtimeViewerSource,
  "updateNhAnimatedTextures(boundary.scene, renderClientCycle)",
  "RuntimeSceneViewer player texture animation cycle"
);
assertSourceIncludes(
  runtimeViewerSource,
  "updateNhPlayerModelPainterOrder(boundary.scene, boundary.camera)",
  "RuntimeSceneViewer player model painter ordering cycle"
);
for (const snippet of [
  "withClientViewTraceFixtureIds",
  "selectRuntimeReplay(window, frame.clientViewTraceFixtureId)",
  "reference:list-client-view",
  "policy:read-default",
  "scrollRuntimeIntoView",
  "preload.cjs",
  "stripJsonBom"
]) {
  assertSourceIncludes(renderParitySource, snippet, "render parity captured client-view replay selection");
}
for (const snippet of [
  "reference:list-client-view",
  "reference:read-client-view",
  "clientReferenceRoot",
  "stripJsonBom"
]) {
  assertSourceIncludes(electronMainSource, snippet, "Electron main captured client-view trace bridge");
}

const fireCapeModel = sources.cacheModels["9638"];
const fireCapeTexture = sources.textures.textures.find((texture) => texture.id === 40);
assert(fireCapeModel, "Fire cape worn model 9638 should be exported from the Nh cache");
assert(
  fireCapeModel.faceTextures?.includes(40),
  "Fire cape worn model 9638 should carry source face texture id 40"
);
assert(
  fireCapeModel.faceTextureUCoordinates?.some((coords) => coords?.length === 3) &&
    fireCapeModel.faceTextureVCoordinates?.some((coords) => coords?.length === 3),
  "Fire cape worn model 9638 should carry computed Nh texture UVs"
);
assert(fireCapeTexture, "Fire cape texture 40 should be exported from Nh texture definitions");
assert(
  fireCapeTexture.animationDirection === 1 && fireCapeTexture.animationSpeed === 2,
  `Fire cape texture 40 should keep Nh animation timing: ${JSON.stringify(fireCapeTexture)}`
);

for (const loadout of runtimeLoadouts) {
  const composed = composeNhPlayerModel(sources, {
    itemIds: loadout.itemIds,
    bodyColors: loadout.bodyColors
  });
  const fixtureMetadata = readJson(loadout.meshMetadataPath);
  assert(composed.metadata.equipmentSlots.length === 12, `${loadout.id} should carry twelve appearance slots`);
  assert(composed.metadata.bodyColors.length === 5, `${loadout.id} should carry five body colors`);
  assert(
    composed.metadata.sourceVertexCount === fixtureMetadata.sourceVertexCount,
    `${loadout.id} source vertex count should match the cache GLB fixture`
  );
  assert(
    composed.metadata.expandedVertexCount === fixtureMetadata.expandedVertexCount,
    `${loadout.id} expanded vertex count should match the cache GLB fixture`
  );
  assert(
    composed.metadata.sourceFaceCount === fixtureMetadata.sourceFaceCount,
    `${loadout.id} source face count should match the cache GLB fixture`
  );
  assert(
    composed.metadata.expandedToSourceFace?.length === composed.metadata.expandedVertexCount,
    `${loadout.id} should preserve expanded vertex to source face mapping for alpha transforms`
  );
  assert(
    sceneMaterialTransparent(composed.scene) === hasVisibleSourceFaceAlpha(composed.metadata),
    `${loadout.id} player mesh material transparency should only be enabled for visible source face alpha`
  );
  if (loadout.itemIds.includes(6570)) {
    assert(sceneHasTextureMaterial(composed.scene, 40), `${loadout.id} should render Fire cape with texture 40`);
    assert(
      sceneTextureMaterialDepthTest(composed.scene, 40) === true,
      `${loadout.id} Fire cape material should still depth-test against terrain/object depth`
    );
    assert(
      sceneTextureMaterialDepthWrite(composed.scene, 40) === false,
      `${loadout.id} Fire cape material should not self-write GPU depth before later Nh painter faces`
    );
    assert(
      sceneTextureMaterialTransparent(composed.scene, 40) === true,
      `${loadout.id} Fire cape material should stay in Three's transparent render pass so group order is not material-id sorted`
    );
    const painterGeometry = firstPainterGeometry(composed.scene);
    assert(painterGeometry, `${loadout.id} should mark the composed actor geometry for Nh painter sorting`);
    assert(
      painterGeometry.userData.nhUsesFaceRenderPriorities === true,
      `${loadout.id} should use the Nh faceRenderPriorities path because Fire cape model 9638 has priorities`
    );
    const beforePainterIndex = Array.from(painterGeometry.index.array.slice(0, 90));
    const painterCamera = new PerspectiveCamera(45, 1, 0.1, 1000);
    painterCamera.position.set(0, 0, 12);
    painterCamera.lookAt(0, 0, 0);
    updateNhPlayerModelPainterOrder(composed.scene, painterCamera);
    const afterPainterIndex = Array.from(painterGeometry.index.array.slice(0, 90));
    assert(
      beforePainterIndex.some((value, index) => value !== afterPainterIndex[index]),
      `${loadout.id} Nh painter order should be recalculated from projected depth instead of staying static`
    );
    assert(sceneTextureGeometryUvCount(composed.scene, 40) > 0, `${loadout.id} Fire cape texture mesh should carry UVs`);
    updateNhAnimatedTextures(composed.scene, 32);
    const textureOffset = sceneTextureOffset(composed.scene, 40);
    assert(
      textureOffset?.y === -0.5 && textureOffset?.x === 0,
      `${loadout.id} Fire cape texture 40 should animate with Nh direction=1 speed=2 at client cycle 32: ${JSON.stringify(textureOffset)}`
    );
    assert(
      composed.metadata.sourceModels.some(
        (sourceModel) => sourceModel.kind === "item" && sourceModel.itemId === 6570 && sourceModel.modelId === 9638
      ),
      `${loadout.id} should source Fire cape from worn model 9638`
    );
  }

  const sourceItemIds = new Set(
    composed.metadata.sourceModels
      .filter((sourceModel) => sourceModel.kind === "item")
      .map((sourceModel) => sourceModel.itemId)
  );
  for (const itemId of loadout.itemIds.filter(isRenderableAppearanceItem)) {
    assert(sourceItemIds.has(itemId), `${loadout.id} should include equipped item ${itemId}`);
  }

  const alternateBodyColors = composeNhPlayerModel(sources, {
    itemIds: loadout.itemIds,
    bodyColors: [1, 1, 1, 1, 1]
  });
  assert(
    alternateBodyColors.metadata.sourceVertexCount === composed.metadata.sourceVertexCount,
    `${loadout.id} body recolors should not change source geometry`
  );
  assert(
    colorDelta(geometryColorArray(composed.scene), geometryColorArray(alternateBodyColors.scene)) > 0,
    `${loadout.id} body recolors should affect vertex colors`
  );

  summary.push({
    loadoutId: loadout.id,
    equipmentSlots: composed.metadata.equipmentSlots,
    sourceVertexCount: composed.metadata.sourceVertexCount,
    expandedVertexCount: composed.metadata.expandedVertexCount,
    itemIds: [...sourceItemIds].sort((left, right) => left - right)
  });
}

const acbLoadout = summary.find((entry) => entry.loadoutId === "acb-hides");
assert(acbLoadout, "missing ACB loadout summary for raw appearance packet verification");
const kodaiLoadout = summary.find((entry) => entry.loadoutId === "kodai-robes");
assert(kodaiLoadout, "missing Kodai loadout summary for head-slot verification");
assert(kodaiLoadout.equipmentSlots[0] === 12929 + 512, "Kodai loadout should equip the NH bot serpentine helm in appearance slot 0");
const serpentineHelm = serverItemById.get(12929);
assert(
  serpentineHelm?.hideHair ? kodaiLoadout.equipmentSlots[8] === 0 : kodaiLoadout.equipmentSlots[8] >= 256,
  "hat hideHair should control default hair exactly like Appearance.append(styleIndex 0)"
);
assert(
  serpentineHelm?.hideBeard ? kodaiLoadout.equipmentSlots[11] === 0 : kodaiLoadout.equipmentSlots[11] >= 256,
  "hat hideBeard should control default jaw exactly like Appearance.append(styleIndex 1)"
);
const rawAppearanceBytes = buildRawAppearancePacket({
  gender: 1,
  headIconPk: -1,
  headIconPrayer: 2,
  equipmentSlots: acbLoadout.equipmentSlots,
  bodyColors: [1, 2, 3, 4, 5],
  sequences: {
    ready: 808,
    turnLeft: 823,
    walk: 819,
    walkBack: 820,
    walkLeft: 821,
    walkRight: 822,
    run: -1
  },
  username: "RawTester",
  prefix: "Sir",
  suffix: "ofPackets",
  combatLevel: 126,
  skillLevel: 2277,
  isHidden: true
});
const decodedPacket = decodeNhPlayerAppearancePacket(rawAppearanceBytes, {
  bodyColorPaletteLengths,
  itemTeamById: { 11785: 7 }
});
assert(decodedPacket.bytesRead === rawAppearanceBytes.length, "raw appearance decoder should consume the packet");
assert(decodedPacket.isFemale, "raw appearance gender byte should map to PlayerAppearance.isFemale");
assert(decodedPacket.headIconPk === -1, "raw appearance should decode signed pk icon byte");
assert(decodedPacket.headIconPrayer === 2, "raw appearance should decode signed prayer icon byte");
const redemptionPacket = decodeNhPlayerAppearancePacket(
  createNhClientAppearancePacket({
    equipment: {},
    prayerIcon: "redemption",
    skullIcon: "none",
    username: "Redemption"
  }),
  { bodyColorPaletteLengths }
);
assert(redemptionPacket.headIconPrayer === 5, "appearance packet builder should encode redemption as headIconPrayer index 5");
assert(decodedPacket.team === 7, "raw appearance should derive team from equipped item definitions");
assert(decodedPacket.sequences.ready === 808, "raw appearance should decode ready sequence");
assert(decodedPacket.sequences.turnRight === decodedPacket.sequences.turnLeft, "raw appearance turnRight should mirror turnLeft");
assert(decodedPacket.sequences.run === -1, "raw appearance should normalize 65535 sequence ids to -1");
assert(decodedPacket.username === "RawTester", "raw appearance should decode username");
assert(decodedPacket.prefix === "Sir", "raw appearance should decode prefix");
assert(decodedPacket.suffix === "ofPackets", "raw appearance should decode suffix");
assert(decodedPacket.combatLevel === 126, "raw appearance should decode combat level");
assert(decodedPacket.skillLevel === 2277, "raw appearance should decode skill level");
assert(decodedPacket.isHidden, "raw appearance should decode hidden flag");
assertArrayEquals(decodedPacket.equipmentSlots, acbLoadout.equipmentSlots, "raw appearance equipment slots should match Player.method1088 slot encoding");
assertArrayEquals(decodedPacket.bodyColors, [1, 2, 3, 4, 5], "raw appearance body colors should decode in order");
assertArrayEquals(
  decodedPacket.itemIds.sort((left, right) => left - right),
  equipmentSlotItemIds(acbLoadout.equipmentSlots),
  "raw appearance item ids should be derived from encoded equipment slots"
);

const packetRuntimeAppearance = nhRuntimeAppearanceFromDecodedPacket(decodedPacket);
assert(packetRuntimeAppearance.source === "client-packet", "decoded packet runtime appearance should keep its source");
const packetModel = composeNhPlayerModel(sources, packetRuntimeAppearance);
assertArrayEquals(
  packetModel.metadata.equipmentSlots,
  acbLoadout.equipmentSlots,
  "decoded packet appearance should compose with exact raw equipment slots"
);

const invalidBodyColorPacket = decodeNhPlayerAppearancePacket(
  buildRawAppearancePacket({
    equipmentSlots: acbLoadout.equipmentSlots,
    bodyColors: [255, 2, 3, 4, 5],
    sequences: { ready: -1, turnLeft: -1, walk: -1, walkBack: -1, walkLeft: -1, walkRight: -1, run: -1 },
    username: "InvalidColor"
  }),
  { bodyColorPaletteLengths }
);
assert(invalidBodyColorPacket.bodyColors[0] === 0, "raw appearance should clamp out-of-range body colors to zero");

const npcTransformPacket = decodeNhPlayerAppearancePacket(
  buildRawAppearancePacket({
    equipmentSlots: [],
    bodyColors: [0, 0, 0, 0, 0],
    sequences: { ready: -1, turnLeft: -1, walk: -1, walkBack: -1, walkLeft: -1, walkRight: -1, run: -1 },
    username: "NpcTransform",
    npcTransformId: 307
  }),
  { bodyColorPaletteLengths }
);
assert(npcTransformPacket.npcTransformId === 307, "raw appearance should decode npc transform id from sentinel equipment slot");
assert(npcTransformPacket.equipmentSlots[0] === 65535, "raw appearance should preserve the npc-transform sentinel slot");
assert(npcTransformPacket.itemIds.length === 0, "npc-transform appearance should not derive item ids from the sentinel");

const rawAppearanceTraceBase = createDefaultNhDuelClientViewTrace({ ticks: 2 });
const generatedPacketActor = rawAppearanceTraceBase.ticks[0].actors.self;
const generatedPacket = generatedPacketActor.appearancePacket;
assert(Array.isArray(generatedPacket) && generatedPacket.length > 0, "generated NH trace actors should carry raw appearance packets");
const generatedDecodedPacket = decodeNhPlayerAppearancePacket(generatedPacket, { bodyColorPaletteLengths });
assertArrayEquals(
  generatedDecodedPacket.equipmentSlots,
  nhAppearanceEquipmentSlots(generatedPacketActor.equipment),
  "generated raw appearance packet should encode the same source equipment slots exposed in the client-view actor"
);
assertArrayEquals(
  createNhClientAppearancePacket({ equipment: generatedPacketActor.equipment, prayerIcon: generatedPacketActor.overheadPrayer, skullIcon: generatedPacketActor.skullIcon, username: "Local trainer" }),
  generatedPacket,
  "generated raw appearance packet builder should be deterministic for the visible actor"
);

const rawAppearanceTrace = {
  ...rawAppearanceTraceBase,
  fixtureId: "raw-appearance-packet-v1",
  description: "Generated trace with a raw Player.method1088 appearance packet on the local actor.",
  ticks: rawAppearanceTraceBase.ticks.map((tick, index) =>
    index === 0
      ? {
          ...tick,
          actors: {
            ...tick.actors,
            self: {
              ...tick.actors.self,
              equipment: {
                head: { itemId: 12929, name: "Serpentine helm (uncharged)" },
                cape: { itemId: 22109, name: "Ava's assembler" },
                amulet: { itemId: 19547, name: "Necklace of anguish" },
                weapon: { itemId: 11785, name: "Armadyl crossbow" },
                body: { itemId: 11828, name: "Armadyl chestplate" },
                shield: { itemId: 6889, name: "Mage's book" },
                legs: { itemId: 11830, name: "Armadyl chainskirt" },
                hands: { itemId: 7462, name: "Barrows gloves" },
                feet: { itemId: 11840, name: "Dragon boots" }
              },
              appearancePacket: [...rawAppearanceBytes]
            }
          }
        }
      : tick
  )
};
assertValidClientViewTrace(rawAppearanceTrace);
const rawAppearanceReplay = clientViewTraceToRuntimeReplay(rawAppearanceTrace);
const rawAppearancePose = rawAppearanceReplay.timeline[0]?.actors.find((pose) => pose.actorId === "local-player");
assert(rawAppearancePose?.appearance?.source === "client-packet", "client-view replay should prefer raw appearance packets when present");
assert(
  rawAppearancePose?.loadoutId === "acb-hides",
  `ACB plus Mage's book must stay on the ranged loadout; Mage's book is shared and must not force Kodai: ${JSON.stringify(rawAppearancePose)}`
);
assertArrayEquals(
  rawAppearancePose.appearance.equipmentSlots ?? [],
  acbLoadout.equipmentSlots,
  "client-view replay should pass decoded raw packet equipment slots to runtime appearance"
);
assertArrayEquals(
  rawAppearancePose.appearance.bodyColors,
  [1, 2, 3, 4, 5],
  "client-view replay should pass decoded raw packet body colors to runtime appearance"
);

const kodaiVisibleEquipment = {
  head: { itemId: 12929, name: "Serpentine helm (uncharged)" },
  cape: { itemId: 21791, name: "Imbued saradomin cape" },
  amulet: { itemId: 12002, name: "Occult necklace" },
  weapon: { itemId: 21006, name: "Kodai wand" },
  body: { itemId: 4712, name: "Ahrim's robetop" },
  shield: { itemId: 6889, name: "Mage's book" },
  legs: { itemId: 4714, name: "Ahrim's robeskirt" },
  hands: { itemId: 7462, name: "Barrows gloves" },
  feet: { itemId: 11840, name: "Dragon boots" }
};
const kodaiAppearanceTrace = {
  ...rawAppearanceTraceBase,
  fixtureId: "kodai-appearance-loadout-v1",
  description: "Generated trace proving Kodai equipment still resolves to the mage loadout.",
  ticks: rawAppearanceTraceBase.ticks.map((tick, index) =>
    index === 0
      ? {
          ...tick,
          actors: {
            ...tick.actors,
            self: {
              ...tick.actors.self,
              equipment: kodaiVisibleEquipment,
              appearancePacket: createNhClientAppearancePacket({
                equipment: kodaiVisibleEquipment,
                prayerIcon: tick.actors.self.overheadPrayer,
                skullIcon: tick.actors.self.skullIcon,
                username: "Local trainer"
              })
            }
          }
        }
      : tick
  )
};
assertValidClientViewTrace(kodaiAppearanceTrace);
const kodaiAppearanceReplay = clientViewTraceToRuntimeReplay(kodaiAppearanceTrace);
const kodaiAppearancePose = kodaiAppearanceReplay.timeline[0]?.actors.find((pose) => pose.actorId === "local-player");
assert(
  kodaiAppearancePose?.loadoutId === "kodai-robes",
  `Kodai equipment should resolve to the mage loadout after the shared Mage's book guard: ${JSON.stringify(kodaiAppearancePose)}`
);

const sequenceOverrideModel = composeNhPlayerModel(sources, {
  itemIds: [11785, 4736, 4738],
  bodyColors: [0, 0, 0, 0, 0],
  shieldOverrideId: 6889 + 512,
  weaponOverrideId: 6914 + 512
});
const sequenceOverrideItemIds = new Set(
  sequenceOverrideModel.metadata.sourceModels
    .filter((sourceModel) => sourceModel.kind === "item")
    .map((sourceModel) => sourceModel.itemId)
);
assert(
  sequenceOverrideModel.metadata.equipmentSlots[3] === 6914 + 512,
  "primary sequence weapon override should replace appearance slot 3"
);
assert(
  sequenceOverrideModel.metadata.equipmentSlots[5] === 6889 + 512,
  "primary sequence shield override should replace appearance slot 5"
);
assert(sequenceOverrideItemIds.has(6914), "sequence weapon override should compose the override weapon model");
assert(sequenceOverrideItemIds.has(6889), "sequence shield override should compose the override shield model");
assert(!sequenceOverrideItemIds.has(11785), "sequence weapon override should replace the base weapon model");

const twoHandedLoadoutModel = composeNhPlayerModel(sources, {
  itemIds: [4153, 6889, 11832, 11834],
  bodyColors: [0, 0, 0, 0, 0]
});
const twoHandedItemIds = new Set(
  twoHandedLoadoutModel.metadata.sourceModels
    .filter((sourceModel) => sourceModel.kind === "item")
    .map((sourceModel) => sourceModel.itemId)
);
assert(twoHandedLoadoutModel.metadata.equipmentSlots[3] === 4153 + 512, "two-handed weapon should occupy weapon slot");
assert(twoHandedLoadoutModel.metadata.equipmentSlots[5] === 0, "two-handed weapon should clear the shield slot like Equipment.equip");
assert(!twoHandedItemIds.has(6889), "two-handed weapon composition should not render the cleared shield model");

const clientViewTraces = [
  createDefaultNhDuelClientViewTrace({ ticks: 12 }),
  createInventorySwitchNhDuelClientViewTrace(),
  readJson("fixtures/sim/client-view-two-actor-duel.json"),
  rawAppearanceTrace
];
const replayAppearanceSummary = [];
const seenAppearanceKeys = new Set();

for (const trace of clientViewTraces) {
  const replay = clientViewTraceToRuntimeReplay(trace);
  for (const keyframe of replay.timeline) {
    for (const pose of keyframe.actors) {
      if (!pose.appearance) {
        throw new Error(`${replay.id} ${pose.actorId} tick ${keyframe.cycle} is missing client-view appearance`);
      }
      if (trace.sourceAnchorIds.includes("client-player-appearance-packet")) {
        const traceTick = trace.ticks.find((tick) => tick.tick === keyframe.cycle);
        const clientActorId = pose.actorId === "local-player" ? "self" : "opponent";
        const clientActor = traceTick?.actors[clientActorId];
        assert(clientActor?.appearancePacket, `${replay.id} ${pose.actorId} tick ${keyframe.cycle} is missing raw appearance bytes`);
        const decoded = decodeNhPlayerAppearancePacket(clientActor.appearancePacket, { bodyColorPaletteLengths });
        assertArrayEquals(
          decoded.equipmentSlots,
          nhAppearanceEquipmentSlots(clientActor.equipment),
          `${replay.id} ${pose.actorId} tick ${keyframe.cycle} raw appearance bytes should encode visible equipment`
        );
        assert(
          pose.appearance.source === "client-packet",
          `${replay.id} ${pose.actorId} tick ${keyframe.cycle} should decode client appearance packet bytes`
        );
        assert(
          (pose.appearance.equipmentSlots ?? []).length === 12,
          `${replay.id} ${pose.actorId} tick ${keyframe.cycle} should expose twelve decoded equipment slots`
        );
      }
      const appearanceKey = `${pose.appearance.bodyColors.join(",")}:${pose.appearance.itemIds.join(",")}`;
      if (seenAppearanceKeys.has(appearanceKey)) {
        continue;
      }
      seenAppearanceKeys.add(appearanceKey);

      for (const itemId of pose.appearance.itemIds) {
        assert(sources.cacheItems[itemId], `${replay.id} appearance item ${itemId} is missing cache definition`);
        assert(serverItemById.has(itemId), `${replay.id} appearance item ${itemId} is missing server definition`);
      }

      const composed = composeNhPlayerModel(sources, pose.appearance);
      const sourceItemIds = new Set(
        composed.metadata.sourceModels
          .filter((sourceModel) => sourceModel.kind === "item")
          .map((sourceModel) => sourceModel.itemId)
      );
      for (const itemId of pose.appearance.itemIds) {
        const equipSlot = serverItemById.get(itemId)?.equipSlot;
        if (Number.isInteger(equipSlot) && equipSlot >= 0 && equipSlot < 12) {
          assert(sourceItemIds.has(itemId), `${replay.id} appearance model should include equipped item ${itemId}`);
        }
      }

      replayAppearanceSummary.push({
        replayId: replay.id,
        itemIds: pose.appearance.itemIds,
        equipmentSlots: composed.metadata.equipmentSlots,
        sourceVertexCount: composed.metadata.sourceVertexCount,
        expandedVertexCount: composed.metadata.expandedVertexCount
      });
    }
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      composedLoadouts: summary,
      clientViewAppearanceCount: replayAppearanceSummary.length,
      clientViewAppearances: replayAppearanceSummary,
      sequenceOverride: {
        equipmentSlots: sequenceOverrideModel.metadata.equipmentSlots,
        itemIds: [...sequenceOverrideItemIds].sort((left, right) => left - right)
      },
      rawAppearancePacket: {
        username: decodedPacket.username,
        source: packetRuntimeAppearance.source,
        equipmentSlots: decodedPacket.equipmentSlots,
        itemIds: decodedPacket.itemIds,
        bodyColors: decodedPacket.bodyColors,
        sequences: decodedPacket.sequences,
        npcTransformId: npcTransformPacket.npcTransformId
      },
      clientViewTracePipeline: {
        storesRawAppearancePacket: true,
        validatesCapturedTraceFiles: true,
        loadsCapturedTraceReplays: true,
        renderParitySelectsCapturedTraceReplay: true,
        sourceAnchorIds: [
          "client-player-appearance-packet",
          "client-camera-held-arrow-contract",
          "client-minimap-widget-draw-contract",
          "client-scene-minimap-sprite-build-contract",
          "client-minimap-dot-projection-contract",
          "client-minimap-hint-arrow-contract",
          "client-container-widget-update-contract",
          "client-inventory-widget-item-draw-contract",
          "client-inventory-use-selection-contract",
          "client-inventory-selected-item-sprite-contract",
          "client-stat-run-state-packet-contract",
          "client-widget-cs1-stat-run-value-contract"
        ]
      }
    },
    null,
    2
  )
);
