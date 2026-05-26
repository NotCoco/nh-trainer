import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  KRONOS_TILE_MODEL_FACE_TYPES,
  KRONOS_TILE_MODEL_VERTEX_TYPES,
  createKronosTileModel
} from "./kronos-tile-model.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertSame(name, actual, expected) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`${name} mismatch: actual=${left} expected=${right}`);
  }
}

assertSame("shape 2 vertex table", KRONOS_TILE_MODEL_VERTEX_TYPES[2], [1, 3, 5, 7]);
assertSame("shape 7 face table", KRONOS_TILE_MODEL_FACE_TYPES[7], [0, 4, 1, 2, 0, 4, 2, 5, 1, 0, 4, 5, 1, 0, 5, 3]);

const model = createKronosTileModel({
  shape: 7,
  rotation: 1,
  texture: 12,
  tileX: 2,
  tileY: 3,
  heightSw: 10,
  heightNw: 20,
  heightNe: 30,
  heightSe: 40,
  underlaySwColor: 100,
  underlayNwColor: 200,
  underlayNeColor: 300,
  underlaySeColor: 400,
  overlaySwColor: 1000,
  overlayNwColor: 2000,
  overlayNeColor: 3000,
  overlaySeColor: 4000
});

assert(model.isFlat === false, "sloped tile model should not be flat");
assertSame(
  "shape 7 rotation 1 vertices",
  model.vertices,
  [
    { type: 1, x: 256, y: 10, z: 384 },
    { type: 3, x: 384, y: 20, z: 384 },
    { type: 5, x: 384, y: 30, z: 512 },
    { type: 7, x: 256, y: 40, z: 512 },
    { type: 8, x: 256, y: 25, z: 448 },
    { type: 4, x: 384, y: 25, z: 448 }
  ]
);
assertSame(
  "shape 7 rotation 1 faces",
  model.faces.map((face) => ({ surface: face.surface, indices: face.indices, texture: face.texture, colors: face.colors })),
  [
    { surface: 0, indices: [4, 0, 1], texture: -1, colors: [250, 100, 200] },
    { surface: 0, indices: [4, 1, 5], texture: -1, colors: [250, 200, 250] },
    { surface: 1, indices: [3, 4, 5], texture: 12, colors: [4000, 2500, 2500] },
    { surface: 1, indices: [3, 5, 2], texture: 12, colors: [4000, 2500, 3000] }
  ]
);

const arena = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "render", "maps", "inferno_arena.json"), "utf8"));
const floorDefs = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "assets", "defs", "floors.json"), "utf8"));
const textureDefs = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "assets", "defs", "textures.json"), "utf8"));
const terrainGlb = readGlbJson(path.join(projectRoot, "fixtures", "render", "maps", "inferno_arena.glb"));
const objectPlacements = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "render", "maps", "inferno_arena_objects.json"), "utf8"));
const objectGlb = readGlbJson(path.join(projectRoot, "fixtures", "render", "maps", "inferno_arena_objects.glb"));
const sourceAnchors = JSON.parse(readFileSync(path.join(projectRoot, "src", "evidence", "sourceAnchors.json"), "utf8"));
const arenaExporterSource = readFileSync(path.join(projectRoot, "scripts", "export-arena-glb.mjs"), "utf8");
const runtimeSceneSource = readFileSync(path.join(projectRoot, "src", "render", "runtimeScene.ts"), "utf8");
const shapedOverlayTiles = arena.tiles.filter((tile) => tile.overlayId > 0 && tile.overlayPath + 1 > 1);
const fullOverlayTiles = arena.tiles.filter((tile) => tile.overlayId > 0 && tile.overlayPath + 1 === 1);
const underlayPaintTiles = arena.tiles.filter((tile) => tile.overlayId <= 0);
const floorOverlays = new Map(floorDefs.overlays.map((overlay) => [overlay.id, overlay]));
const floorUnderlays = new Map(floorDefs.underlays.map((underlay) => [underlay.id, underlay]));
const terrainTextures = new Map(textureDefs.textures.map((texture) => [texture.id, texture]));
const expectedObjectCount = objectPlacements.filter((placement) => Array.isArray(placement.modelIds) && placement.modelIds.length > 0).length;
assert(shapedOverlayTiles.length === 55, `expected 55 shaped overlay tiles, got ${shapedOverlayTiles.length}`);
const shapeCounts = shapedOverlayTiles.reduce((counts, tile) => {
  const shape = tile.overlayPath + 1;
  counts[shape] = (counts[shape] ?? 0) + 1;
  return counts;
}, {});
assertSame("shaped overlay counts", shapeCounts, { 2: 9, 3: 9, 4: 11, 6: 2, 7: 17, 8: 2, 9: 1, 10: 4 });
const expectedTileModelIndexCount =
  shapedOverlayTiles.reduce((sum, tile) => sum + tileModelVisibleFaceCount(tile) * 3, 0);
const expectedTilePaintIndexCount =
  underlayPaintTiles.reduce((sum, tile) => sum + tilePaintVisibleTriangleCount(tile, "underlay") * 3, 0) +
  fullOverlayTiles.reduce((sum, tile) => sum + tilePaintVisibleTriangleCount(tile, "overlay") * 3, 0);
const tilePaintMaterialIndex = terrainGlb.materials.findIndex((material) => material.name === "cache-terrain-tilepaint-faces");
const tileModelMaterialIndex = terrainGlb.materials.findIndex((material) => material.name === "cache-terrain-tilemodel-faces");
const terrainTextureImageUris = new Set((terrainGlb.images ?? []).map((image) => image.uri));
const terrainMaterials = terrainGlb.materials.filter((material) => material.extras?.kronosSceneLayer === "terrain");
const terrainTextureMaterials = terrainGlb.materials.filter((material) => material.name.startsWith("cache-terrain-") && material.pbrMetallicRoughness?.baseColorTexture);
assert(tilePaintMaterialIndex >= 0, "generated terrain GLB should contain the TilePaint material");
assert(tileModelMaterialIndex >= 0, "generated terrain GLB should contain the TileModel material");
assert(terrainGlb.extensionsUsed?.includes("KHR_materials_unlit"), "terrain GLB should opt into unlit source-baked tile colors");
for (const material of terrainMaterials) {
  assert(
    material.extensions?.KHR_materials_unlit,
    `terrain material ${material.name} should preserve source-baked colors without Three lighting`
  );
}
assert(terrainTextureImageUris.has("../textures/texture_1.png"), "terrain GLB should include the cache texture used by textured floor overlays");
assert(
  terrainTextureMaterials.some((material) => material.name === "cache-terrain-tilepaint-texture-1"),
  "full-tile textured overlays should use a TilePaint texture material"
);
assert(
  terrainTextureMaterials.some((material) => material.name === "cache-terrain-tilemodel-texture-1"),
  "shaped textured overlays should use a TileModel texture material"
);
for (const material of terrainTextureMaterials) {
  assert(material.alphaMode === "MASK" && material.alphaCutoff === 0.5, `terrain texture material ${material.name} should be alpha-masked`);
}
assert(arenaExporterSource.includes("buildClientTerrainLightness"), "arena exporter should derive corner lightness from client height gradients");
assert(!arenaExporterSource.includes("tile.x * 11"), "arena exporter should not add coordinate-based fake terrain color variation");
assert(!arenaExporterSource.includes("litRgba(colors[index]"), "TilePaint terrain colors should not receive a second fake lighting pass");
assert(!arenaExporterSource.includes("litRgba(face.colors[index]"), "TileModel terrain colors should not receive a second fake lighting pass");
assert(!arenaExporterSource.includes("fallbackTerrainRgba"), "terrain export should not paint source-transparent floor triangles with a handmade fallback color");
assert(arenaExporterSource.includes("clientTransparentTerrainColor = 12345678"), "terrain export should preserve the client transparent terrain sentinel");
assert(arenaExporterSource.includes("appendTilePaintTriangle(mesh, materialKey, vertices, colors, uvs, [2, 3, 1], colors[2])"), "TilePaint export should use the client NE/NW/SE triangle first");
assert(arenaExporterSource.includes("appendTilePaintTriangle(mesh, materialKey, vertices, colors, uvs, [0, 1, 3], colors[0])"), "TilePaint export should use the client SW/SE/NW triangle second");
assert(arenaExporterSource.includes("isTransparentTerrainColor(face.colors[0])"), "TileModel export should skip source-transparent non-textured faces like the client");
const tilePaintPrimitive = terrainGlb.meshes[0].primitives.find((primitive) => primitive.material === tilePaintMaterialIndex);
const tileModelPrimitive = terrainGlb.meshes[0].primitives.find((primitive) => primitive.material === tileModelMaterialIndex);
assert(tilePaintPrimitive, "generated terrain GLB should contain a TilePaint primitive");
assert(tileModelPrimitive, "generated terrain GLB should contain a TileModel primitive");
const actualTilePaintIndexCount = terrainPrimitiveIndexCount(terrainGlb, "cache-terrain-tilepaint");
const actualTileModelIndexCount = terrainPrimitiveIndexCount(terrainGlb, "cache-terrain-tilemodel");
assert(
  actualTilePaintIndexCount === expectedTilePaintIndexCount,
  `TilePaint primitive index count mismatch: actual=${actualTilePaintIndexCount} expected=${expectedTilePaintIndexCount}`
);
assert(
  actualTileModelIndexCount === expectedTileModelIndexCount,
  `TileModel primitive index count mismatch: actual=${actualTileModelIndexCount} expected=${expectedTileModelIndexCount}`
);
const sourceAnchorIds = new Set(sourceAnchors.map((anchor) => anchor.id));
for (const anchorId of [
  "cache-object-render-lighting-fields",
  "client-object-lighting-contract",
  "client-modeldata-lighting-contract",
  "client-floor-decoration-layer-contract",
  "client-object-model-transform-contract",
  "client-modeldata-object-rotation-contract"
]) {
  assert(sourceAnchorIds.has(anchorId), `missing source evidence anchor ${anchorId}`);
}
assert(arenaExporterSource.includes("clientObjectLightness"), "arena exporter should bake client-style object lightness");
assert(arenaExporterSource.includes("clientLightingAdjustedHsl"), "arena exporter should apply ModelData HSL lightness adjustment");
assert(arenaExporterSource.includes("createClientModelLighting"), "arena exporter should compute object face colors from ModelData normals");
assert(arenaExporterSource.includes("(placement.ambient ?? 0) + 64"), "object lighting should use ObjectDefinition ambient + 64");
assert(arenaExporterSource.includes("(placement.contrast ?? 0) + 768"), "object lighting should use ObjectDefinition contrast + 768");
assert(arenaExporterSource.includes("-50 * normal.x + -10 * normal.y + -50 * normal.z"), "object lighting should use the client object light vector");
assert(arenaExporterSource.includes("clientObjectVertex"), "object export should use client object transform order");
assert(arenaExporterSource.includes("isObjectGroundContoured"), "object export should preserve the client contoured-ground gate");
assert(arenaExporterSource.includes("clientSceneObjectLayer"), "object export should keep floor decorations in a distinct layer");
assert(!arenaExporterSource.includes("bakedLightDirection"), "object export should not keep the old custom light direction");
assert(!arenaExporterSource.includes("litRgba"), "object export should not use custom renderer-style light baking");
const objectSourceObjects = objectGlb.meshes[0].extras?.sourceObjects ?? [];
const objectMaterials = objectGlb.materials ?? [];
const objectTextureImageUris = new Set((objectGlb.images ?? []).map((image) => image.uri));
const objectTextureMaterials = objectMaterials.filter((material) => material.pbrMetallicRoughness?.baseColorTexture);
const objectSceneLayers = new Set(objectMaterials.map((material) => material.extras?.kronosSceneLayer));
const objectAnimationCount = objectSourceObjects.filter((placement) => placement.animationId >= 0).length;
const objectMorphCount = objectSourceObjects.filter(
  (placement) =>
    placement.transformVarbit >= 0 ||
    placement.transformVarp >= 0 ||
    (Array.isArray(placement.transforms) && placement.transforms.length > 0)
).length;
assert(objectGlb.meshes[0].extras?.objectCount === expectedObjectCount, "object GLB should report every source object placement");
assert(objectSourceObjects.length === expectedObjectCount, "object GLB should retain source object placement metadata");
assert(objectSourceObjects.every((placement) => Array.isArray(placement.actions)), "object GLB should retain source object action slot metadata");
assert(
  objectSourceObjects.every((placement) => Number.isInteger(placement.animationId)),
  "object GLB should retain source object animation id metadata"
);
assert(
  objectSourceObjects.every((placement) => Number.isInteger(placement.transformVarbit) && Number.isInteger(placement.transformVarp)),
  "object GLB should retain source object transform varbit/varp metadata"
);
assert(
  objectSourceObjects.every((placement) => Array.isArray(placement.transforms)),
  "object GLB should retain source object transform destination metadata"
);
assert(objectAnimationCount === 0, `current Inferno arena fixture should have zero animated object placements, got ${objectAnimationCount}`);
assert(objectMorphCount === 0, `current Inferno arena fixture should have zero morphed object placements, got ${objectMorphCount}`);
assert(
  runtimeSceneSource.includes("the current arena source contains zero animated or morphed object placements"),
  "runtime arena-object gate should not describe animation/morph parity as missing for the current source fixture"
);
assert(objectSourceObjects.some((placement) => placement.type === 22), "object GLB should include floor-decoration source objects");
assert(objectSourceObjects.some((placement) => placement.type !== 22), "object GLB should include scene-object source objects");
assert(objectSceneLayers.has("floor-decoration"), "object GLB should include a floor-decoration scene layer");
assert(objectSceneLayers.has("scene-object"), "object GLB should include a scene-object layer");
assert(objectGlb.extensionsUsed?.includes("KHR_materials_unlit"), "object GLB should opt into unlit source-baked object colors");
for (const material of objectMaterials) {
  assert(
    material.extensions?.KHR_materials_unlit,
    `object material ${material.name} should preserve source-baked colors without Three lighting`
  );
}
assert(
  objectMaterials.some((material) => material.name === "cache-floor-decoration-face-colors"),
  "floor decorations should have a vertex-color material"
);
assert(
  objectMaterials.some((material) => material.name === "cache-scene-object-face-colors"),
  "scene objects should have a vertex-color material"
);
assert(objectTextureImageUris.has("../textures/texture_8.png"), "object GLB should include cache texture 8");
assert(objectTextureImageUris.has("../textures/texture_60.png"), "object GLB should include cache texture 60");
assert(
  objectTextureMaterials.some((material) => material.name === "cache-floor-decoration-texture-8"),
  "floor decorations should retain textured object material 8"
);
assert(
  objectTextureMaterials.some((material) => material.name === "cache-scene-object-texture-8"),
  "scene objects should retain textured object material 8"
);
assert(
  objectTextureMaterials.some((material) => material.name === "cache-scene-object-texture-60"),
  "scene objects should retain textured object material 60"
);
for (const material of objectTextureMaterials) {
  assert(material.alphaMode === "MASK" && material.alphaCutoff === 0.5, `object texture material ${material.name} should be alpha-masked`);
}
for (const primitive of objectGlb.meshes[0].primitives) {
  assert(primitive.attributes?.COLOR_0 === 2, "object primitives should carry baked per-vertex colors");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      underlayPaintTiles: underlayPaintTiles.length,
      shapedOverlayTiles: shapedOverlayTiles.length,
      fullOverlayTiles: fullOverlayTiles.length,
      shapeCounts,
      sampleFaceCount: model.faces.length,
      terrainTextureImages: [...terrainTextureImageUris].sort(),
      terrainTextureMaterials: terrainTextureMaterials.map((material) => material.name).sort(),
      objectCount: objectSourceObjects.length,
      objectAnimationCount,
      objectMorphCount,
      objectTextureImages: [...objectTextureImageUris].sort(),
      objectTextureMaterials: objectTextureMaterials.map((material) => material.name).sort(),
      tilePaintPrimitiveIndices: actualTilePaintIndexCount,
      tileModelPrimitiveIndices: actualTileModelIndexCount
    },
    null,
    2
  )
);

function terrainPrimitiveIndexCount(glb, materialNamePrefix) {
  return glb.meshes[0].primitives.reduce((sum, primitive) => {
    const material = glb.materials[primitive.material];
    if (!material?.name?.startsWith(materialNamePrefix)) {
      return sum;
    }
    return sum + glb.accessors[primitive.indices].count;
  }, 0);
}

function tileModelFaceCount(shape) {
  return createKronosTileModel({
    shape,
    rotation: 0,
    heightSw: 0,
    heightNw: 0,
    heightNe: 0,
    heightSe: 0,
    underlaySwColor: 0,
    underlayNwColor: 0,
    underlayNeColor: 0,
    underlaySeColor: 0,
    overlaySwColor: 0,
    overlayNwColor: 0,
    overlayNeColor: 0,
    overlaySeColor: 0
  }).faces.length;
}

function tileModelVisibleFaceCount(tile) {
  const shape = tile.overlayPath + 1;
  return KRONOS_TILE_MODEL_FACE_TYPES[shape].reduce((count, _, index, faceTypes) => {
    if (index % 4 !== 0) {
      return count;
    }
    const surface = faceTypes[index];
    return count + (tileSurfaceIsVisible(tile, surface === 0 ? "underlay" : "overlay") ? 1 : 0);
  }, 0);
}

function tilePaintVisibleTriangleCount(tile, surface) {
  return tileSurfaceIsVisible(tile, surface) ? 2 : 0;
}

function tileSurfaceIsVisible(tile, surface) {
  if (surface === "underlay") {
    return tile.underlayId > 0 && floorUnderlays.has(tile.underlayId - 1);
  }

  const overlay = tile.overlayId > 0 ? floorOverlays.get(tile.overlayId - 1) : null;
  if (!overlay) {
    return false;
  }
  if (overlay.texture >= 0 && terrainTextures.get(overlay.texture)?.image) {
    return true;
  }
  return overlay.rgbColor !== 0xff00ff;
}

function readGlbJson(filePath) {
  const buffer = readFileSync(filePath);
  const magic = buffer.readUInt32LE(0);
  assert(magic === 0x46546c67, `${filePath} is not a GLB file`);
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  assert(jsonType === 0x4e4f534a, `${filePath} first chunk is not JSON`);
  return JSON.parse(buffer.slice(20, 20 + jsonLength).toString("utf8").trim());
}
