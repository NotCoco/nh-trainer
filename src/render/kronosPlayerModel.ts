import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  RepeatWrapping,
  Texture,
  TextureLoader,
  Vector3
} from "three";
import type { Object3D } from "three";
import type { KronosLoadoutMeshMetadata } from "./kronosSequencePlayback";

type PlayerBodyColors = readonly [number, number, number, number, number];

export interface KronosCacheItemDefinition {
  readonly id: number;
  readonly name: string;
  readonly inventoryModel?: number;
  readonly maleModel0?: number;
  readonly maleModel1?: number;
  readonly maleModel2?: number;
  readonly resizeX?: number;
  readonly resizeY?: number;
  readonly resizeZ?: number;
  readonly ambient?: number;
  readonly contrast?: number;
  readonly countobj?: readonly number[];
  readonly countco?: readonly number[];
  readonly countObj?: readonly number[];
  readonly countCo?: readonly number[];
  readonly colorFind?: readonly number[];
  readonly colorReplace?: readonly number[];
}

interface KronosKitDefinition {
  readonly id: number;
  readonly bodyPartId: number;
  readonly modelIds?: readonly number[];
  readonly nonSelectable?: boolean;
  readonly recolorToFind?: readonly number[];
  readonly recolorToReplace?: readonly number[];
}

export interface KronosCacheModelDefinition {
  readonly id: number;
  readonly priority?: number;
  readonly vertexCount?: number;
  readonly vertexPositionsX: readonly number[];
  readonly vertexPositionsY: readonly number[];
  readonly vertexPositionsZ: readonly number[];
  readonly vertexGroups?: Record<string, readonly number[]>;
  readonly faceCount?: number;
  readonly faceVertexIndices1: readonly number[];
  readonly faceVertexIndices2: readonly number[];
  readonly faceVertexIndices3: readonly number[];
  readonly faceColors: readonly number[];
  readonly faceRenderTypes?: readonly number[];
  readonly faceRenderPriorities?: readonly number[];
  readonly faceAlphas?: readonly number[];
  readonly faceSkins?: readonly number[];
  readonly faceTextures?: readonly number[];
  readonly textureCoordinates?: readonly number[];
  readonly textureTriangleVertexIndices1?: readonly number[];
  readonly textureTriangleVertexIndices2?: readonly number[];
  readonly textureTriangleVertexIndices3?: readonly number[];
  readonly textureRenderTypes?: readonly number[];
  readonly faceTextureUCoordinates?: readonly (readonly number[])[];
  readonly faceTextureVCoordinates?: readonly (readonly number[])[];
}

interface KronosServerItemDefinition {
  readonly id: number;
  readonly equipSlot: number | null;
  readonly twoHanded?: boolean;
  readonly hideHair?: boolean;
  readonly hideBeard?: boolean;
  readonly hideArms?: boolean;
}

type KronosEquippedServerItemDefinition = KronosServerItemDefinition & { readonly equipSlot: number };

interface KronosBodyColorDefinitions {
  readonly primaryRecolorFrom: readonly number[];
  readonly primaryPalettes: readonly (readonly number[])[];
  readonly secondaryRecolorFrom: readonly number[];
  readonly secondaryPalettes: readonly (readonly number[])[];
}

interface KronosTextureDefinitionStore {
  readonly textures: readonly KronosTextureDefinition[];
}

interface KronosTextureDefinition {
  readonly id: number;
  readonly averageHsl: number;
  readonly transparent?: boolean;
  readonly image?: string;
  readonly width?: number;
  readonly height?: number;
  readonly animationDirection?: number;
  readonly animationSpeed?: number;
}

export interface KronosPlayerModelSources {
  readonly cacheItems: Record<string, KronosCacheItemDefinition>;
  readonly kits: Record<string, KronosKitDefinition>;
  readonly cacheModels: Record<string, KronosCacheModelDefinition>;
  readonly serverItems: readonly KronosServerItemDefinition[];
  readonly bodyColors: KronosBodyColorDefinitions;
  readonly textures?: KronosTextureDefinitionStore;
}

export interface KronosPlayerAppearanceModelInput {
  readonly itemIds: readonly number[];
  readonly equipmentSlots?: readonly number[];
  readonly bodyColors: PlayerBodyColors;
  readonly shieldOverrideId?: number;
  readonly weaponOverrideId?: number;
}

export interface KronosComposedPlayerModel {
  readonly scene: Object3D;
  readonly metadata: KronosLoadoutMeshMetadata & {
    readonly source: string;
    readonly equipmentSlots: readonly number[];
    readonly bodyColors: PlayerBodyColors;
    readonly sourceModels: readonly object[];
  };
}

export interface KronosGroundItemModelInput {
  readonly itemId: number;
  readonly quantity: number;
}

export interface KronosGroundItemModelSource {
  readonly itemId: number;
  readonly itemName: string;
  readonly quantity: number;
  readonly modelId: number;
  readonly item: KronosCacheItemDefinition;
  readonly model: KronosCacheModelDefinition;
}

export interface KronosComposedGroundItemModel {
  readonly scene: Object3D;
  readonly source: KronosGroundItemModelSource;
  readonly metadata: {
    readonly source: string;
    readonly itemId: number;
    readonly itemName: string;
    readonly quantity: number;
    readonly modelId: number;
    readonly sourceModels: readonly object[];
  };
}

interface KronosMutableMesh {
  readonly positions: number[];
  readonly colors: number[];
  readonly uvs: number[];
  readonly indices: number[];
  readonly triangleTextureIds: number[];
  readonly trianglePriorities: number[];
  usesFaceRenderPriorities: boolean;
  readonly sourceModels: object[];
  readonly sourceVertexGroups: number[];
  readonly sourceFaceAlphaGroups: number[];
  readonly sourceFaceAlphas: number[];
  readonly expandedToSourceVertex: number[];
  readonly expandedToSourceFace: number[];
}

interface KronosPlayerModelPart {
  readonly model: KronosCacheModelDefinition;
  readonly recolorSource: { readonly colorFind?: readonly number[]; readonly colorReplace?: readonly number[]; readonly recolorToFind?: readonly number[]; readonly recolorToReplace?: readonly number[] };
  readonly sourceModel: object;
}

interface KronosPreparedPlayerModelPart extends KronosPlayerModelPart {
  readonly sourceVertexBase: number;
  readonly sourceFaceBase: number;
}

interface KronosPreparedPlayerFace {
  readonly part: KronosPreparedPlayerModelPart;
  readonly faceIndex: number;
  readonly priority: number;
  readonly sourceOrder: number;
}

interface KronosPainterTriangle {
  readonly triangle: number;
  readonly priority: number;
  readonly depth: number;
  readonly sourceOrder: number;
}

interface KronosPlayerPainterGeometryUserData {
  kronosPlayerPainter?: true;
  kronosTrianglePriorities?: readonly number[];
  kronosTriangleMaterialIndices?: readonly number[];
  kronosTriangleSourceIndices?: readonly number[];
  kronosTriangleCount?: number;
  kronosUsesFaceRenderPriorities?: boolean;
  kronosSource?: string;
}

interface KronosPlayerTextureMaterialKey {
  readonly textureId: number;
  readonly transparent: boolean;
}

interface KronosClientModelLightingConfig {
  readonly ambient: number;
  readonly contrast: number;
  readonly lightX: number;
  readonly lightY: number;
  readonly lightZ: number;
  readonly lightDenominator: number;
}

const ITEM_MODEL_FIELDS = ["maleModel0", "maleModel1", "maleModel2"] as const;
const RASTERIZER_3D_BRIGHTNESS = 0.9;
const RASTERIZER_3D_COLOR_PALETTE = buildRasterizer3dColorPalette(RASTERIZER_3D_BRIGHTNESS, 0, 512);
const KRONOS_UNTEXTURED_FACE_ID = -1;
const KRONOS_TEXTURE_SIZE = 128;
const sharedKronosPlayerTextureLoader = new TextureLoader();
const sharedKronosPlayerTextures = new Map<string, Texture>();
const kronosPainterPoint = new Vector3();
const DEFAULT_MALE_BODY_PARTS = [
  { bodyPartId: 0, equipmentSlot: 8, label: "hair" },
  { bodyPartId: 1, equipmentSlot: 11, label: "jaw" },
  { bodyPartId: 2, equipmentSlot: 4, label: "torso" },
  { bodyPartId: 3, equipmentSlot: 6, label: "arms" },
  { bodyPartId: 4, equipmentSlot: 9, label: "hands" },
  { bodyPartId: 5, equipmentSlot: 7, label: "legs" },
  { bodyPartId: 6, equipmentSlot: 10, label: "feet" }
] as const;

export function composeKronosPlayerModel(
  sources: KronosPlayerModelSources,
  input: KronosPlayerAppearanceModelInput
): KronosComposedPlayerModel {
  const serverItemById = new Map(sources.serverItems.map((item) => [item.id, item]));
  const equipmentSlots = kronosEquipmentSlotsWithSequenceOverrides(
    input.equipmentSlots
      ? normalizeKronosEquipmentSlots(input.equipmentSlots)
      : kronosEquipmentSlotsFromLoadoutItems(input.itemIds, sources.kits, serverItemById),
    input
  );
  const mesh = createMesh();
  const parts: KronosPlayerModelPart[] = [];

  for (let slot = 0; slot < equipmentSlots.length; slot += 1) {
    const equipment = equipmentSlots[slot];
    if (equipment >= 256 && equipment < 512) {
      collectKit(parts, sources, equipment - 256, slot);
    } else if (equipment >= 512) {
      collectItem(parts, sources, equipment - 512, slot);
    }
  }

  const sharedVertexNormals = createClientPlayerSharedVertexNormals(parts);
  const preparedParts = preparePlayerModelParts(mesh, parts);
  appendPreparedPlayerFaces(mesh, preparedParts, sources.bodyColors, input.bodyColors, sharedVertexNormals);
  for (const part of preparedParts) {
    mesh.sourceModels.push(part.sourceModel);
  }

  if (mesh.indices.length === 0) {
    throw new Error("Kronos player appearance produced no geometry");
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(mesh.positions), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(mesh.colors), 4));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(mesh.uvs), 2));
  geometry.setIndex(new BufferAttribute(new Uint32Array(mesh.indices), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const textureDefinitions = new Map((sources.textures?.textures ?? []).map((texture) => [texture.id, texture]));
  const scene = createPlayerAppearanceScene(geometry, mesh, textureDefinitions);

  return {
    scene,
    metadata: {
      source: "Kronos PlayerAppearance.method4156 equipment slot order and cache ModelDefinition parts",
      sourceVertexCount: mesh.sourceVertexGroups.length,
      expandedVertexCount: mesh.expandedToSourceVertex.length,
      sourceVertexGroups: mesh.sourceVertexGroups,
      expandedToSourceVertex: mesh.expandedToSourceVertex,
      sourceFaceCount: mesh.sourceFaceAlphaGroups.length,
      sourceFaceAlphaGroups: mesh.sourceFaceAlphaGroups,
      sourceFaceAlphas: mesh.sourceFaceAlphas,
      expandedToSourceFace: mesh.expandedToSourceFace,
      equipmentSlots,
      bodyColors: input.bodyColors,
      sourceModels: mesh.sourceModels
    }
  };
}

export function composeKronosGroundItemModel(
  sources: KronosPlayerModelSources,
  input: KronosGroundItemModelInput
): KronosComposedGroundItemModel | null {
  const source = resolveKronosGroundItemModelSource(sources, input);
  if (!source) {
    return null;
  }

  const mesh = createMesh();
  const part: KronosPlayerModelPart = {
    model: kronosGroundItemCacheModelForSource(source),
    recolorSource: source.item,
    sourceModel: {
      kind: "ground-item",
      itemId: source.itemId,
      itemName: source.itemName,
      quantity: source.quantity,
      modelId: source.modelId
    }
  };
  const preparedParts = preparePlayerModelParts(mesh, [part]);
  appendPreparedModelFaces(
    mesh,
    preparedParts,
    (face) => applySourceRecolors(face.part.model.faceColors[face.faceIndex], face.part.recolorSource),
    new Map(),
    kronosGroundItemLightingConfig(source.item)
  );
  mesh.sourceModels.push(part.sourceModel);

  if (mesh.indices.length === 0) {
    return null;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(mesh.positions), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(mesh.colors), 4));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(mesh.uvs), 2));
  geometry.setIndex(new BufferAttribute(new Uint32Array(mesh.indices), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const textureDefinitions = new Map((sources.textures?.textures ?? []).map((texture) => [texture.id, texture]));
  const scene = createPlayerAppearanceScene(geometry, mesh, textureDefinitions);
  scene.userData.kronosGroundItem = true;
  scene.userData.kronosSource =
    "TileItem.vmethod3072 -> ItemDefinition.getModel(quantity) -> ModelData.method2778";

  return {
    scene,
    source,
    metadata: {
      source:
        "Kronos TileItem.vmethod3072 uses ItemDefinition.getModel(quantity); ground item model is the item inventoryModel with item resize/recolor and ambient+64 contrast+768 lighting",
      itemId: source.itemId,
      itemName: source.itemName,
      quantity: source.quantity,
      modelId: source.modelId,
      sourceModels: mesh.sourceModels
    }
  };
}

export function resolveKronosGroundItemModelSource(
  sources: KronosPlayerModelSources,
  input: KronosGroundItemModelInput
): KronosGroundItemModelSource | null {
  const sourceItemId = Math.trunc(input.itemId);
  const sourceItem = sources.cacheItems[String(sourceItemId)];
  if (!sourceItem) {
    return null;
  }

  const resolvedItemId = kronosGroundItemQuantityVariantId(sourceItem, input.quantity);
  const item = resolvedItemId === sourceItemId ? sourceItem : sources.cacheItems[String(resolvedItemId)];
  if (!item) {
    return null;
  }

  const modelId = item.inventoryModel;
  if (!Number.isInteger(modelId) || modelId === undefined || modelId < 0) {
    return null;
  }

  const model = sources.cacheModels[String(modelId)];
  if (!model) {
    return null;
  }

  return {
    itemId: item.id,
    itemName: item.name,
    quantity: Math.max(1, Math.trunc(input.quantity)),
    modelId,
    item,
    model
  };
}

export function kronosGroundItemCacheModelForSource(
  source: KronosGroundItemModelSource
): KronosCacheModelDefinition {
  const resizeX = source.item.resizeX ?? 128;
  const resizeY = source.item.resizeY ?? 128;
  const resizeZ = source.item.resizeZ ?? 128;
  if (resizeX === 128 && resizeY === 128 && resizeZ === 128) {
    return source.model;
  }

  return {
    ...source.model,
    vertexPositionsX: source.model.vertexPositionsX.map((value) => Math.trunc((value * resizeX) / 128)),
    vertexPositionsY: source.model.vertexPositionsY.map((value) => Math.trunc((value * resizeY) / 128)),
    vertexPositionsZ: source.model.vertexPositionsZ.map((value) => Math.trunc((value * resizeZ) / 128))
  };
}

export function normalizeKronosEquipmentSlots(equipmentSlots: readonly number[]): readonly number[] {
  if (equipmentSlots.length !== 12) {
    throw new Error(`Kronos player appearance requires 12 equipment slots, got ${equipmentSlots.length}`);
  }

  return equipmentSlots.map((slot, index) => {
    if (!Number.isInteger(slot) || slot < 0 || slot > 65535) {
      throw new Error(`invalid Kronos equipment slot ${index}: ${slot}`);
    }
    return slot;
  });
}

export function kronosEquipmentSlotsFromLoadoutItems(
  itemIds: readonly number[],
  kits: Record<string, KronosKitDefinition>,
  serverItemById: ReadonlyMap<number, KronosServerItemDefinition>
): readonly number[] {
  const hiddenKitSlots = new Set<number>();
  const equipmentSlots = new Array<number>(12).fill(0);
  const equippedServerItems: KronosEquippedServerItemDefinition[] = [];

  for (const itemId of itemIds) {
    const serverItem = serverItemById.get(itemId);
    if (!serverItem) {
      throw new Error(`missing server item ${itemId}`);
    }
    if (!isPlayerAppearanceSlot(serverItem.equipSlot)) {
      continue;
    }
    const equippedServerItem = serverItem as KronosEquippedServerItemDefinition;
    equippedServerItems.push(equippedServerItem);
    markHiddenBodyKitSlots(hiddenKitSlots, equippedServerItem);
  }

  for (const bodyPart of defaultMaleKits(kits)) {
    if (!hiddenKitSlots.has(bodyPart.equipmentSlot)) {
      equipmentSlots[bodyPart.equipmentSlot] = bodyPart.kit.id + 256;
    }
  }

  for (const itemId of itemIds) {
    const serverItem = serverItemById.get(itemId);
    if (!serverItem) {
      throw new Error(`missing server item ${itemId}`);
    }
    if (!isPlayerAppearanceSlot(serverItem.equipSlot)) {
      continue;
    }
    equipmentSlots[(serverItem as KronosEquippedServerItemDefinition).equipSlot] = itemId + 512;
  }
  clearInvalidTwoHandedAppearanceSlots(equipmentSlots, equippedServerItems);

  return equipmentSlots;
}

function kronosEquipmentSlotsWithSequenceOverrides(
  equipmentSlots: readonly number[],
  input: Pick<KronosPlayerAppearanceModelInput, "shieldOverrideId" | "weaponOverrideId">
): readonly number[] {
  if (input.shieldOverrideId === undefined && input.weaponOverrideId === undefined) {
    return equipmentSlots;
  }

  const overridden = [...equipmentSlots];
  if (input.shieldOverrideId !== undefined && input.shieldOverrideId >= 0) {
    overridden[5] = input.shieldOverrideId;
  }
  if (input.weaponOverrideId !== undefined && input.weaponOverrideId >= 0) {
    overridden[3] = input.weaponOverrideId;
  }
  return overridden;
}

function isPlayerAppearanceSlot(slot: number | null): slot is number {
  return Number.isInteger(slot) && slot !== null && slot >= 0 && slot < 12;
}

function markHiddenBodyKitSlots(hiddenKitSlots: Set<number>, serverItem: KronosEquippedServerItemDefinition): void {
  hiddenKitSlots.add(serverItem.equipSlot);
  if (serverItem.equipSlot === 0 && serverItem.hideHair) {
    hiddenKitSlots.add(8);
  }
  if (serverItem.equipSlot === 0 && serverItem.hideBeard) {
    hiddenKitSlots.add(11);
  }
  if (serverItem.equipSlot === 4 && serverItem.hideArms) {
    hiddenKitSlots.add(6);
  }
}

function clearInvalidTwoHandedAppearanceSlots(
  equipmentSlots: number[],
  equippedServerItems: readonly KronosEquippedServerItemDefinition[]
): void {
  const weapon = equippedServerItems.find((item) => item.equipSlot === 3);
  if (weapon?.twoHanded) {
    equipmentSlots[5] = 0;
  }
}

function createMesh(): KronosMutableMesh {
  return {
    positions: [],
    colors: [],
    uvs: [],
    indices: [],
    triangleTextureIds: [],
    trianglePriorities: [],
    usesFaceRenderPriorities: false,
    sourceModels: [],
    sourceVertexGroups: [],
    sourceFaceAlphaGroups: [],
    sourceFaceAlphas: [],
    expandedToSourceVertex: [],
    expandedToSourceFace: []
  };
}

function createPlayerAppearanceScene(
  geometry: BufferGeometry,
  mesh: KronosMutableMesh,
  textureDefinitions: ReadonlyMap<number, KronosTextureDefinition>
): Mesh | Group {
  const opaqueTriangles: number[] = [];
  const alphaTriangles: number[] = [];
  for (let triangle = 0; triangle < mesh.indices.length / 3; triangle += 1) {
    const target = playerTriangleUsesTransparentPass(mesh, triangle, textureDefinitions)
      ? alphaTriangles
      : opaqueTriangles;
    target.push(triangle);
  }

  if (alphaTriangles.length === 0) {
    const scene = createPlayerAppearanceSubmesh(
      geometry,
      mesh,
      textureDefinitions,
      opaqueTriangles,
      "cache-composed-player-appearance-opaque"
    );
    scene.name = "cache-composed-player-appearance-opaque";
    return scene;
  }

  const root = new Group();
  root.name = "cache-composed-player-appearance";
  if (opaqueTriangles.length > 0) {
    root.add(
      createPlayerAppearanceSubmesh(
        clonePlayerAppearanceGeometry(geometry),
        mesh,
        textureDefinitions,
        opaqueTriangles,
        "cache-composed-player-appearance-opaque"
      )
    );
  }
  root.add(
    createPlayerAppearanceSubmesh(
      clonePlayerAppearanceGeometry(geometry),
      mesh,
      textureDefinitions,
      alphaTriangles,
      "cache-composed-player-appearance-alpha"
    )
  );
  return root;
}

function createPlayerAppearanceSubmesh(
  geometry: BufferGeometry,
  mesh: KronosMutableMesh,
  textureDefinitions: ReadonlyMap<number, KronosTextureDefinition>,
  sourceTriangles: readonly number[],
  name: string
): Mesh {
  geometry.clearGroups();
  const indexArray = new Uint32Array(sourceTriangles.length * 3);
  const materialIndices = new Map<string, number>();
  const materials: MeshBasicMaterial[] = [];
  const triangleMaterialIndices: number[] = [];
  let groupStart = 0;
  let groupCount = 0;
  let currentMaterialIndex = -1;
  for (let orderedIndex = 0; orderedIndex < sourceTriangles.length; orderedIndex += 1) {
    const triangle = sourceTriangles[orderedIndex];
    indexArray[orderedIndex * 3] = triangle * 3;
    indexArray[orderedIndex * 3 + 1] = triangle * 3 + 1;
    indexArray[orderedIndex * 3 + 2] = triangle * 3 + 2;

    const key = playerTriangleMaterialKey(mesh, triangle, textureDefinitions);
    const keyId = playerTriangleMaterialKeyId(key);
    let materialIndex = materialIndices.get(keyId);
    if (materialIndex === undefined) {
      materialIndex = materials.length;
      materialIndices.set(keyId, materialIndex);
      materials.push(createPlayerAppearanceMaterial(key, textureDefinitions));
    }
    triangleMaterialIndices[triangle] = materialIndex;
    if (materialIndex !== currentMaterialIndex) {
      if (groupCount > 0) {
        geometry.addGroup(groupStart, groupCount, currentMaterialIndex);
      }
      groupStart = orderedIndex * 3;
      groupCount = 0;
      currentMaterialIndex = materialIndex;
    }
    groupCount += 3;
  }
  if (groupCount > 0) {
    geometry.addGroup(groupStart, groupCount, currentMaterialIndex);
  }
  geometry.setIndex(new BufferAttribute(indexArray, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const scene = new Mesh(geometry, materials);
  scene.name = name;
  scene.userData.kronosPlayerPainter = true;
  scene.userData.kronosSource =
    "Kronos Model.method2375 projected depth bucket ordering and face priority pass";
  const geometryUserData = geometry.userData as KronosPlayerPainterGeometryUserData;
  geometryUserData.kronosPlayerPainter = true;
  geometryUserData.kronosTrianglePriorities = [...mesh.trianglePriorities];
  geometryUserData.kronosTriangleMaterialIndices = triangleMaterialIndices;
  geometryUserData.kronosTriangleSourceIndices = [...sourceTriangles];
  geometryUserData.kronosTriangleCount = sourceTriangles.length;
  geometryUserData.kronosUsesFaceRenderPriorities = mesh.usesFaceRenderPriorities;
  geometryUserData.kronosSource =
    "Kronos Model.method2375 projected depth bucket ordering and face priority pass";
  return scene;
}

function clonePlayerAppearanceGeometry(source: BufferGeometry): BufferGeometry {
  const geometry = new BufferGeometry();
  const position = source.getAttribute("position") as BufferAttribute;
  const color = source.getAttribute("color") as BufferAttribute;
  const uv = source.getAttribute("uv") as BufferAttribute;
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(position.array as ArrayLike<number>), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(color.array as ArrayLike<number>), 4));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uv.array as ArrayLike<number>), 2));
  return geometry;
}

function playerTriangleUsesTransparentPass(
  mesh: KronosMutableMesh,
  triangle: number,
  textureDefinitions: ReadonlyMap<number, KronosTextureDefinition>
): boolean {
  return playerTriangleMaterialKey(mesh, triangle, textureDefinitions).transparent;
}

function playerTriangleMaterialKey(
  mesh: KronosMutableMesh,
  triangle: number,
  textureDefinitions: ReadonlyMap<number, KronosTextureDefinition>
): KronosPlayerTextureMaterialKey {
  const sourceFace = mesh.expandedToSourceFace[triangle * 3] ?? -1;
  const textureId = mesh.triangleTextureIds[triangle] ?? KRONOS_UNTEXTURED_FACE_ID;
  const textureDefinition = textureDefinitions.get(textureId);
  return {
    textureId,
    transparent:
      (sourceFace >= 0 && unsignedByte(mesh.sourceFaceAlphas[sourceFace] ?? 0) !== 0) ||
      textureDefinition?.transparent === true
  };
}

function playerTriangleMaterialKeyId(key: KronosPlayerTextureMaterialKey): string {
  return `${key.textureId}:${key.transparent ? 1 : 0}`;
}

function createPlayerAppearanceMaterial(
  key: KronosPlayerTextureMaterialKey,
  textureDefinitions: ReadonlyMap<number, KronosTextureDefinition>
): MeshBasicMaterial {
  const textureDefinition = textureDefinitions.get(key.textureId);
  const texture = key.textureId === KRONOS_UNTEXTURED_FACE_ID ? null : kronosPlayerTexture(key.textureId, textureDefinition);
  const transparent = key.transparent;
  const material = new MeshBasicMaterial({
    // Browser renderer split: opaque faces stay in Three's opaque path while source alpha and
    // transparent texture faces use the transparent path. This preserves Kronos face alpha
    // semantics without letting ordinary gear sort through capes or other transparent parts.
    depthTest: true,
    depthWrite: !transparent,
    map: texture,
    alphaTest: textureDefinition?.transparent ? 0.5 : 0,
    transparent,
    vertexColors: true
  });
  material.name =
    key.textureId === KRONOS_UNTEXTURED_FACE_ID
      ? "kronos-player-vertex-colors"
      : `kronos-player-texture-${key.textureId}`;
  material.userData.kronosTextureId = key.textureId;
  material.userData.kronosSource =
    key.textureId === KRONOS_UNTEXTURED_FACE_ID
      ? "Kronos ModelData.method2778 untextured face colors"
      : "Kronos Model.faceTextures textured draw path";
  return material;
}

function defaultMaleKits(kits: Record<string, KronosKitDefinition>) {
  return DEFAULT_MALE_BODY_PARTS.map((bodyPart) => {
    const kit = Object.values(kits).find(
      (candidate) => !candidate.nonSelectable && candidate.bodyPartId === bodyPart.bodyPartId
    );
    if (!kit) {
      throw new Error(`missing selectable male kit for body part ${bodyPart.bodyPartId}`);
    }
    return { ...bodyPart, kit };
  });
}

function collectItem(
  parts: KronosPlayerModelPart[],
  sources: KronosPlayerModelSources,
  itemId: number,
  slot: number
): void {
  const item = sources.cacheItems[String(itemId)];
  if (!item) {
    throw new Error(`missing cache item ${itemId}`);
  }

  for (const modelId of itemModelIds(item)) {
    const model = sources.cacheModels[String(modelId)];
    if (!model) {
      throw new Error(`missing model ${modelId} for ${item.name} (${itemId})`);
    }
    parts.push({
      model,
      recolorSource: item,
      sourceModel: { kind: "item", itemId, itemName: item.name, modelId, slot }
    });
  }
}

function collectKit(
  parts: KronosPlayerModelPart[],
  sources: KronosPlayerModelSources,
  kitId: number,
  slot: number
): void {
  const kit = sources.kits[String(kitId)];
  if (!kit) {
    throw new Error(`missing kit ${kitId}`);
  }

  for (const modelId of kitModelIds(kit)) {
    const model = sources.cacheModels[String(modelId)];
    if (!model) {
      throw new Error(`missing model ${modelId} for kit ${kit.id}`);
    }
    parts.push({
      model,
      recolorSource: kit,
      sourceModel: { kind: "kit", kitId: kit.id, bodyPartId: kit.bodyPartId, modelId, slot }
    });
  }
}

function preparePlayerModelParts(
  mesh: KronosMutableMesh,
  parts: readonly KronosPlayerModelPart[]
): readonly KronosPreparedPlayerModelPart[] {
  return parts.map((part) => {
    const model = part.model;
    const faceCount = model.faceCount ?? model.faceVertexIndices1.length;
    const sourceVertexBase = mesh.sourceVertexGroups.length;
    const sourceFaceBase = mesh.sourceFaceAlphaGroups.length;

    for (const group of modelVertexGroups(model)) {
      mesh.sourceVertexGroups.push(group);
    }

    for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
      const alpha = model.faceAlphas?.[faceIndex] ?? 0;
      mesh.sourceFaceAlphaGroups.push(model.faceSkins?.[faceIndex] ?? -1);
      mesh.sourceFaceAlphas.push(unsignedByte(alpha));
    }

    return { ...part, sourceVertexBase, sourceFaceBase };
  });
}

function appendPreparedPlayerFaces(
  mesh: KronosMutableMesh,
  parts: readonly KronosPreparedPlayerModelPart[],
  bodyColorDefinitions: KronosBodyColorDefinitions,
  bodyColors: PlayerBodyColors,
  sharedVertexNormals: ReadonlyMap<string, ClientModelNormal>
): void {
  appendPreparedModelFaces(
    mesh,
    parts,
    (face) =>
      applyBodyRecolors(
        applySourceRecolors(face.part.model.faceColors[face.faceIndex], face.part.recolorSource),
        bodyColorDefinitions,
        bodyColors
      ),
    sharedVertexNormals,
    CLIENT_PLAYER_MODEL_LIGHTING
  );
}

function appendPreparedModelFaces(
  mesh: KronosMutableMesh,
  parts: readonly KronosPreparedPlayerModelPart[],
  faceColor: (face: KronosPreparedPlayerFace) => number,
  sharedVertexNormals: ReadonlyMap<string, ClientModelNormal>,
  lightingConfig: KronosClientModelLightingConfig
): void {
  const litFaceCache = new Map<KronosPreparedPlayerModelPart, readonly (readonly [number, number, number] | null)[]>();
  const faces: KronosPreparedPlayerFace[] = [];
  let sourceOrder = 0;
  mesh.usesFaceRenderPriorities = kronosComposedModelUsesFaceRenderPriorities(parts);

  for (const part of parts) {
    const model = part.model;
    const faceCount = model.faceCount ?? model.faceVertexIndices1.length;
    litFaceCache.set(
      part,
      createClientPlayerFaceColors(
        model,
        faceCount,
        (faceIndex) => faceColor({ part, faceIndex, priority: kronosModelFacePriority(model, faceIndex), sourceOrder: 0 }),
        sharedVertexNormals,
        lightingConfig
      )
    );

    for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
      faces.push({
        part,
        faceIndex,
        priority: kronosModelFacePriority(model, faceIndex),
        sourceOrder
      });
      sourceOrder += 1;
    }
  }

  for (const face of faces) {
    const { part, faceIndex } = face;
    const model = part.model;
    const litFace = litFaceCache.get(part)?.[faceIndex];
    if (!litFace) {
      continue;
    }
    const vertexIndices = [
      model.faceVertexIndices1[faceIndex],
      model.faceVertexIndices2[faceIndex],
      model.faceVertexIndices3[faceIndex]
    ];
    const alpha = model.faceAlphas?.[faceIndex] ?? 0;
    const textureId = model.faceTextures?.[faceIndex] ?? KRONOS_UNTEXTURED_FACE_ID;
    const colors =
      textureId === KRONOS_UNTEXTURED_FACE_ID
        ? litFace.map((color) => rs2hslToRgba(color, alpha))
        : litFace.map((lightness) => textureLightnessToRgba(lightness, alpha));
    const uvs = kronosModelFaceTextureUvs(model, faceIndex, textureId);

    const triangleBase = mesh.positions.length / 3;
    for (let vertexOffset = 0; vertexOffset < vertexIndices.length; vertexOffset += 1) {
      const vertexIndex = vertexIndices[vertexOffset];
      mesh.positions.push(
        model.vertexPositionsX[vertexIndex],
        -model.vertexPositionsY[vertexIndex],
        model.vertexPositionsZ[vertexIndex]
      );
      mesh.colors.push(...colors[vertexOffset]);
      mesh.uvs.push(...uvs[vertexOffset]);
      mesh.expandedToSourceVertex.push(part.sourceVertexBase + vertexIndex);
      mesh.expandedToSourceFace.push(part.sourceFaceBase + faceIndex);
    }

    // The runtime camera mirrors X in projection, so the x,-y,z model basis keeps Kronos
    // projected winding only when the source A/B/C order is preserved here.
    mesh.indices.push(triangleBase, triangleBase + 1, triangleBase + 2);
    mesh.triangleTextureIds.push(textureId);
    mesh.trianglePriorities.push(face.priority);
  }
}

function kronosComposedModelUsesFaceRenderPriorities(parts: readonly KronosPreparedPlayerModelPart[]): boolean {
  let priority: number | null = null;
  for (const part of parts) {
    if (part.model.faceRenderPriorities && part.model.faceRenderPriorities.length > 0) {
      return true;
    }
    const modelPriority = signedByte(part.model.priority ?? 0);
    if (priority === null) {
      priority = modelPriority;
    } else if (priority !== modelPriority) {
      return true;
    }
  }
  return false;
}

function kronosModelFaceTextureUvs(
  model: KronosCacheModelDefinition,
  faceIndex: number,
  textureId: number
): readonly [number, number][] {
  if (textureId === KRONOS_UNTEXTURED_FACE_ID) {
    return [
      [0, 0],
      [0, 0],
      [0, 0]
    ];
  }

  const u = model.faceTextureUCoordinates?.[faceIndex];
  const v = model.faceTextureVCoordinates?.[faceIndex];
  if (u && v && u.length >= 3 && v.length >= 3) {
    return [
      [u[0], v[0]],
      [u[1], v[1]],
      [u[2], v[2]]
    ];
  }

  return [
    [0, 0],
    [1, 0],
    [0, 1]
  ];
}

function kronosModelFacePriority(model: KronosCacheModelDefinition, faceIndex: number): number {
  if (model.faceRenderPriorities && model.faceRenderPriorities.length > 0) {
    return signedByte(model.faceRenderPriorities[faceIndex] ?? 0);
  }
  return signedByte(model.priority ?? 0);
}

function kronosPlayerFaceDrawOrder(faces: readonly KronosPreparedPlayerFace[]): readonly KronosPreparedPlayerFace[] {
  const priorityBuckets = Array.from({ length: 12 }, () => [] as KronosPreparedPlayerFace[]);
  const deferredFaces: KronosPreparedPlayerFace[] = [];
  for (const face of faces) {
    const priority = face.priority;
    if (priority >= 0 && priority < priorityBuckets.length) {
      priorityBuckets[priority].push(face);
    } else {
      deferredFaces.push(face);
    }
  }

  return [...priorityBuckets.flat(), ...deferredFaces];
}

function createClientPlayerFaceColors(
  model: KronosCacheModelDefinition,
  faceCount: number,
  faceColor: (faceIndex: number) => number,
  sharedVertexNormals: ReadonlyMap<string, ClientModelNormal>,
  lightingConfig: KronosClientModelLightingConfig
): readonly (readonly [number, number, number] | null)[] {
  const lighting = createClientModelDataLighting(model, faceCount);
  return Array.from({ length: faceCount }, (_, faceIndex) => {
    const renderType = clientModelRenderType(model, faceIndex);
    const texture = model.faceTextures?.[faceIndex] ?? KRONOS_UNTEXTURED_FACE_ID;
    const color = faceColor(faceIndex) & 0xffff;

    if (texture === -1) {
      if (renderType === 0) {
        return [
          clientAdjustHslLightness(color, clientVertexLightness(model, lighting, sharedVertexNormals, lightingConfig, faceIndex, 0)),
          clientAdjustHslLightness(color, clientVertexLightness(model, lighting, sharedVertexNormals, lightingConfig, faceIndex, 1)),
          clientAdjustHslLightness(color, clientVertexLightness(model, lighting, sharedVertexNormals, lightingConfig, faceIndex, 2))
        ];
      }
      if (renderType === 1) {
        const lightness = clientFaceLightness(lighting.faceNormals[faceIndex], lightingConfig);
        const flatColor = clientAdjustHslLightness(color, lightness);
        return [flatColor, flatColor, flatColor];
      }
      if (renderType === 3) {
        return [128, 128, 128];
      }
      return null;
    }

    if (renderType === 0) {
      return [
        clientClampLightness(clientVertexLightness(model, lighting, sharedVertexNormals, lightingConfig, faceIndex, 0)),
        clientClampLightness(clientVertexLightness(model, lighting, sharedVertexNormals, lightingConfig, faceIndex, 1)),
        clientClampLightness(clientVertexLightness(model, lighting, sharedVertexNormals, lightingConfig, faceIndex, 2))
      ];
    }
    if (renderType === 1) {
      const flatColor = clientClampLightness(clientFaceLightness(lighting.faceNormals[faceIndex], lightingConfig));
      return [flatColor, flatColor, flatColor];
    }
    return null;
  });
}

function createClientPlayerSharedVertexNormals(parts: readonly KronosPlayerModelPart[]): ReadonlyMap<string, ClientModelNormal> {
  const sharedNormals = new Map<string, ClientModelNormal>();
  for (const part of parts) {
    const model = part.model;
    const faceCount = model.faceCount ?? model.faceVertexIndices1.length;
    const lighting = createClientModelDataLighting(model, faceCount);
    const vertexCount = model.vertexCount ?? model.vertexPositionsX.length;

    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
      const normal = lighting.vertexNormals[vertexIndex];
      if (normal.magnitude === 0) {
        continue;
      }

      const key = clientVertexCoordinateKey(model, vertexIndex);
      const shared = sharedNormals.get(key);
      if (shared) {
        shared.x += normal.x;
        shared.y += normal.y;
        shared.z += normal.z;
        shared.magnitude += normal.magnitude;
      } else {
        sharedNormals.set(key, { ...normal });
      }
    }
  }
  return sharedNormals;
}

function clientVertexCoordinateKey(model: KronosCacheModelDefinition, vertexIndex: number): string {
  return `${model.vertexPositionsX[vertexIndex]}:${model.vertexPositionsY[vertexIndex]}:${model.vertexPositionsZ[vertexIndex]}`;
}

interface ClientModelNormal {
  x: number;
  y: number;
  z: number;
  magnitude: number;
}

function createClientModelDataLighting(
  model: KronosCacheModelDefinition,
  faceCount: number
): {
  readonly vertexNormals: readonly ClientModelNormal[];
  readonly faceNormals: readonly (ClientModelNormal | undefined)[];
} {
  const vertexCount = model.vertexCount ?? model.vertexPositionsX.length;
  const vertexNormals = Array.from({ length: vertexCount }, () => ({ x: 0, y: 0, z: 0, magnitude: 0 }));
  const faceNormals: (ClientModelNormal | undefined)[] = new Array(faceCount);

  for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
    const first = model.faceVertexIndices1[faceIndex];
    const second = model.faceVertexIndices2[faceIndex];
    const third = model.faceVertexIndices3[faceIndex];
    const firstDeltaX = model.vertexPositionsX[second] - model.vertexPositionsX[first];
    const firstDeltaY = model.vertexPositionsY[second] - model.vertexPositionsY[first];
    const firstDeltaZ = model.vertexPositionsZ[second] - model.vertexPositionsZ[first];
    const secondDeltaX = model.vertexPositionsX[third] - model.vertexPositionsX[first];
    const secondDeltaY = model.vertexPositionsY[third] - model.vertexPositionsY[first];
    const secondDeltaZ = model.vertexPositionsZ[third] - model.vertexPositionsZ[first];
    let normalX = firstDeltaY * secondDeltaZ - secondDeltaY * firstDeltaZ;
    let normalY = firstDeltaZ * secondDeltaX - secondDeltaZ * firstDeltaX;
    let normalZ = firstDeltaX * secondDeltaY - secondDeltaX * firstDeltaY;

    while (
      normalX > 8192 ||
      normalY > 8192 ||
      normalZ > 8192 ||
      normalX < -8192 ||
      normalY < -8192 ||
      normalZ < -8192
    ) {
      normalX >>= 1;
      normalY >>= 1;
      normalZ >>= 1;
    }

    let magnitude = Math.trunc(Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ));
    if (magnitude <= 0) {
      magnitude = 1;
    }

    normalX = Math.trunc((normalX * 256) / magnitude);
    normalY = Math.trunc((normalY * 256) / magnitude);
    normalZ = Math.trunc((normalZ * 256) / magnitude);

    if ((model.faceRenderTypes?.[faceIndex] ?? 0) === 1) {
      faceNormals[faceIndex] = { x: normalX, y: normalY, z: normalZ, magnitude: 1 };
      continue;
    }

    for (const vertexIndex of [first, second, third]) {
      const normal = vertexNormals[vertexIndex];
      normal.x += normalX;
      normal.y += normalY;
      normal.z += normalZ;
      normal.magnitude += 1;
    }
  }

  return { vertexNormals, faceNormals };
}

function clientModelRenderType(model: KronosCacheModelDefinition, faceIndex: number): number {
  const alpha = signedByte(model.faceAlphas?.[faceIndex] ?? 0);
  if (alpha === -2) {
    return 3;
  }
  if (alpha === -1) {
    return 2;
  }
  return model.faceRenderTypes?.[faceIndex] ?? 0;
}

const CLIENT_PLAYER_MODEL_AMBIENT = 64;
const CLIENT_PLAYER_MODEL_CONTRAST = 850;
const CLIENT_PLAYER_MODEL_LIGHT_X = -30;
const CLIENT_PLAYER_MODEL_LIGHT_Y = -50;
const CLIENT_PLAYER_MODEL_LIGHT_Z = -30;
const CLIENT_PLAYER_MODEL_LIGHTING = createClientModelLightingConfig(
  CLIENT_PLAYER_MODEL_AMBIENT,
  CLIENT_PLAYER_MODEL_CONTRAST,
  CLIENT_PLAYER_MODEL_LIGHT_X,
  CLIENT_PLAYER_MODEL_LIGHT_Y,
  CLIENT_PLAYER_MODEL_LIGHT_Z
);

function createClientModelLightingConfig(
  ambient: number,
  contrast: number,
  lightX: number,
  lightY: number,
  lightZ: number
): KronosClientModelLightingConfig {
  const lightMagnitude = Math.trunc(Math.sqrt(lightX * lightX + lightY * lightY + lightZ * lightZ));
  return {
    ambient,
    contrast,
    lightX,
    lightY,
    lightZ,
    lightDenominator: (lightMagnitude * contrast) >> 8
  };
}

function kronosGroundItemLightingConfig(item: KronosCacheItemDefinition): KronosClientModelLightingConfig {
  return createClientModelLightingConfig(
    (item.ambient ?? 0) + 64,
    (item.contrast ?? 0) + 768,
    -50,
    -10,
    -50
  );
}

function clientVertexLightness(
  model: KronosCacheModelDefinition,
  lighting: ReturnType<typeof createClientModelDataLighting>,
  sharedVertexNormals: ReadonlyMap<string, ClientModelNormal>,
  lightingConfig: KronosClientModelLightingConfig,
  faceIndex: number,
  vertexOffset: 0 | 1 | 2
): number {
  const vertexIndex =
    vertexOffset === 0
      ? model.faceVertexIndices1[faceIndex]
      : vertexOffset === 1
        ? model.faceVertexIndices2[faceIndex]
        : model.faceVertexIndices3[faceIndex];
  const normal = sharedVertexNormals.get(clientVertexCoordinateKey(model, vertexIndex)) ?? lighting.vertexNormals[vertexIndex];
  const magnitude = Math.max(1, normal.magnitude);
  return (
    Math.trunc(
      (lightingConfig.lightY * normal.y +
        lightingConfig.lightZ * normal.z +
        lightingConfig.lightX * normal.x) /
        (lightingConfig.lightDenominator * magnitude)
    ) + lightingConfig.ambient
  );
}

function clientFaceLightness(
  normal: ClientModelNormal | undefined,
  lightingConfig: KronosClientModelLightingConfig
): number {
  if (!normal) {
    return lightingConfig.ambient;
  }
  return (
    Math.trunc(
      (lightingConfig.lightY * normal.y +
        lightingConfig.lightZ * normal.z +
        lightingConfig.lightX * normal.x) /
        (Math.trunc(lightingConfig.lightDenominator / 2) + lightingConfig.lightDenominator)
    ) + lightingConfig.ambient
  );
}

function clientAdjustHslLightness(color: number, lightness: number): number {
  return (color & 65408) + clientClampLightness(((color & 127) * lightness) >> 7);
}

function clientClampLightness(lightness: number): number {
  if (lightness < 2) {
    return 2;
  }
  if (lightness > 126) {
    return 126;
  }
  return lightness;
}

function itemModelIds(item: KronosCacheItemDefinition): number[] {
  return ITEM_MODEL_FIELDS.map((field) => item[field]).filter((modelId): modelId is number =>
    typeof modelId === "number" && Number.isInteger(modelId) && modelId >= 0
  );
}

function kronosGroundItemQuantityVariantId(item: KronosCacheItemDefinition, quantity: number): number {
  const countObjects = item.countobj ?? item.countObj ?? [];
  const countThresholds = item.countco ?? item.countCo ?? [];
  if (countObjects.length === 0 || countThresholds.length === 0 || quantity <= 1) {
    return item.id;
  }

  let variantId = -1;
  for (let index = 0; index < Math.min(10, countObjects.length, countThresholds.length); index += 1) {
    const threshold = countThresholds[index];
    if (threshold !== 0 && quantity >= threshold) {
      variantId = countObjects[index];
    }
  }
  return variantId === -1 ? item.id : variantId;
}

function kitModelIds(kit: KronosKitDefinition): number[] {
  return (kit.modelIds ?? []).filter((modelId): modelId is number => Number.isInteger(modelId) && modelId >= 0);
}

function modelVertexGroups(model: KronosCacheModelDefinition): number[] {
  const vertexCount = model.vertexCount ?? model.vertexPositionsX.length;
  const groups = new Array<number>(vertexCount).fill(-1);

  for (const [groupId, vertices] of Object.entries(model.vertexGroups ?? {})) {
    for (const vertexIndex of vertices) {
      if (vertexIndex >= 0 && vertexIndex < groups.length) {
        groups[vertexIndex] = Number(groupId);
      }
    }
  }

  return groups;
}

function applySourceRecolors(
  color: number,
  source: { readonly colorFind?: readonly number[]; readonly colorReplace?: readonly number[]; readonly recolorToFind?: readonly number[]; readonly recolorToReplace?: readonly number[] }
): number {
  const find = source.colorFind ?? source.recolorToFind ?? [];
  const replace = source.colorReplace ?? source.recolorToReplace ?? [];
  let output = toSignedShort(color);

  for (let index = 0; index < find.length; index += 1) {
    if (output === toSignedShort(find[index])) {
      output = toSignedShort(replace[index]);
    }
  }

  return output;
}

function applyBodyRecolors(
  color: number,
  definitions: KronosBodyColorDefinitions,
  bodyColors: PlayerBodyColors
): number {
  let output = toSignedShort(color);
  for (let index = 0; index < bodyColors.length; index += 1) {
    const bodyColor = bodyColors[index];
    if (bodyColor < (definitions.primaryPalettes[index]?.length ?? 0)) {
      output = replaceSignedColor(output, definitions.primaryRecolorFrom[index], definitions.primaryPalettes[index][bodyColor]);
    }
    if (bodyColor < (definitions.secondaryPalettes[index]?.length ?? 0)) {
      output = replaceSignedColor(
        output,
        definitions.secondaryRecolorFrom[index],
        definitions.secondaryPalettes[index][bodyColor]
      );
    }
  }
  return output;
}

function replaceSignedColor(color: number, from: number, to: number): number {
  return color === toSignedShort(from) ? toSignedShort(to) : color;
}

function toSignedShort(value: number): number {
  const unsigned = value & 0xffff;
  return unsigned > 0x7fff ? unsigned - 0x10000 : unsigned;
}

function unsignedByte(value: number): number {
  return value & 0xff;
}

function signedByte(value: number): number {
  const unsigned = value & 0xff;
  return unsigned > 0x7f ? unsigned - 0x100 : unsigned;
}

function hasVisibleFaceAlpha(faceAlphas: readonly number[]): boolean {
  return faceAlphas.some((alpha) => unsignedByte(alpha) !== 0);
}

function rs2hslToRgba(color: number, alpha = 0): readonly [number, number, number, number] {
  const rgb = RASTERIZER_3D_COLOR_PALETTE[color & 0xffff] ?? 1;
  const alphaByte = unsignedByte(alpha);
  return [
    ((rgb >> 16) & 0xff) / 255,
    ((rgb >> 8) & 0xff) / 255,
    (rgb & 0xff) / 255,
    alphaByte === 0 ? 1 : 1 - alphaByte / 255
  ];
}

function textureLightnessToRgba(lightness: number, alpha = 0): readonly [number, number, number, number] {
  const channel = Math.max(0, Math.min(1, lightness / 128));
  const alphaByte = unsignedByte(alpha);
  return [channel, channel, channel, alphaByte === 0 ? 1 : 1 - alphaByte / 255];
}

function kronosPlayerTexture(textureId: number, definition: KronosTextureDefinition | undefined): Texture {
  const url = definition?.image ?? `render/textures/texture_${textureId}.png`;
  const key = `${textureId}:${url}`;
  const existing = sharedKronosPlayerTextures.get(key);
  if (existing) {
    return existing;
  }

  const texture =
    typeof Image === "undefined" ? new Texture() : sharedKronosPlayerTextureLoader.load(url);
  texture.name = `kronos-player-texture-${textureId}`;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.userData.kronosTextureId = textureId;
  texture.userData.kronosTextureUrl = url;
  texture.userData.kronosTextureWidth = definition?.width ?? KRONOS_TEXTURE_SIZE;
  texture.userData.kronosTextureHeight = definition?.height ?? KRONOS_TEXTURE_SIZE;
  texture.userData.kronosAnimationDirection = definition?.animationDirection ?? 0;
  texture.userData.kronosAnimationSpeed = definition?.animationSpeed ?? 0;
  texture.userData.kronosSource =
    "Kronos Texture.copy$animate / RuneLite GPU TextureManager.animate direction-speed UV offset";
  sharedKronosPlayerTextures.set(key, texture);
  return texture;
}

export function updateKronosAnimatedTextures(root: Object3D, clientCycle: number): void {
  const updatedTextures = new Set<Texture>();
  const cycle = Math.max(0, Math.floor(clientCycle));
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !mesh.material) {
      return;
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const texture = (material as MeshBasicMaterial).map;
      if (!texture || updatedTextures.has(texture)) {
        continue;
      }
      updateKronosAnimatedTexture(texture, cycle);
      updatedTextures.add(texture);
    }
  });
}

export function updateKronosPlayerModelPainterOrder(root: Object3D, camera: Camera): void {
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    const mesh = node as Mesh<BufferGeometry, MeshBasicMaterial | MeshBasicMaterial[]>;
    if (!mesh.isMesh || !mesh.geometry.userData.kronosPlayerPainter) {
      return;
    }
    updateKronosPlayerMeshPainterOrder(mesh, camera);
  });
}

function updateKronosPlayerMeshPainterOrder(
  mesh: Mesh<BufferGeometry, MeshBasicMaterial | MeshBasicMaterial[]>,
  camera: Camera
): void {
  const geometry = mesh.geometry;
  const userData = geometry.userData as KronosPlayerPainterGeometryUserData;
  const triangleCount = userData.kronosTriangleCount ?? 0;
  const priorities = userData.kronosTrianglePriorities;
  const materialIndices = userData.kronosTriangleMaterialIndices;
  const sourceTriangles = userData.kronosTriangleSourceIndices ?? Array.from({ length: triangleCount }, (_, index) => index);
  const position = geometry.getAttribute("position") as BufferAttribute | undefined;
  const index = geometry.getIndex();
  if (!position || !index || !priorities || !materialIndices || triangleCount <= 0) {
    return;
  }

  const triangles: KronosPainterTriangle[] = [];
  for (const triangle of sourceTriangles) {
    triangles.push({
      triangle,
      priority: priorities[triangle] ?? 0,
      depth: kronosPainterTriangleDepth(mesh, camera, position, triangle),
      sourceOrder: triangle
    });
  }

  const ordered = kronosPainterTriangleOrder(triangles, userData.kronosUsesFaceRenderPriorities === true);
  const indexArray = index.array as Uint16Array | Uint32Array;
  geometry.clearGroups();
  let groupStart = 0;
  let groupCount = 0;
  let currentMaterialIndex = -1;
  for (let orderedIndex = 0; orderedIndex < ordered.length; orderedIndex += 1) {
    const triangle = ordered[orderedIndex].triangle;
    const base = orderedIndex * 3;
    indexArray[base] = triangle * 3;
    indexArray[base + 1] = triangle * 3 + 1;
    indexArray[base + 2] = triangle * 3 + 2;

    const materialIndex = materialIndices[triangle] ?? 0;
    if (materialIndex !== currentMaterialIndex) {
      if (groupCount > 0) {
        geometry.addGroup(groupStart, groupCount, currentMaterialIndex);
      }
      groupStart = base;
      groupCount = 0;
      currentMaterialIndex = materialIndex;
    }
    groupCount += 3;
  }
  if (groupCount > 0) {
    geometry.addGroup(groupStart, groupCount, currentMaterialIndex);
  }
  index.needsUpdate = true;
}

function kronosPainterTriangleDepth(
  mesh: Mesh<BufferGeometry, MeshBasicMaterial | MeshBasicMaterial[]>,
  camera: Camera,
  position: BufferAttribute,
  triangle: number
): number {
  let depth = 0;
  for (let vertexOffset = 0; vertexOffset < 3; vertexOffset += 1) {
    kronosPainterPoint.fromBufferAttribute(position, triangle * 3 + vertexOffset);
    kronosPainterPoint.applyMatrix4(mesh.matrixWorld);
    kronosPainterPoint.applyMatrix4(camera.matrixWorldInverse);
    depth += -kronosPainterPoint.z;
  }
  return depth / 3;
}

function kronosPainterTriangleOrder(
  triangles: readonly KronosPainterTriangle[],
  usesFaceRenderPriorities: boolean
): readonly KronosPainterTriangle[] {
  const depthOrdered = [...triangles].sort((left, right) => {
    const depthDelta = right.depth - left.depth;
    return depthDelta !== 0 ? depthDelta : left.sourceOrder - right.sourceOrder;
  });
  if (!usesFaceRenderPriorities) {
    return depthOrdered;
  }

  const priorityBuckets = Array.from({ length: 12 }, () => [] as KronosPainterTriangle[]);
  const priorityDepthSums = new Array<number>(12).fill(0);
  for (const triangle of depthOrdered) {
    const priority = triangle.priority >= 0 && triangle.priority < 12 ? triangle.priority : 0;
    priorityBuckets[priority].push(triangle);
    if (priority < 10) {
      priorityDepthSums[priority] += triangle.depth;
    }
  }

  const depth12 = kronosPriorityAverageDepth(priorityBuckets, priorityDepthSums, 1, 2);
  const depth34 = kronosPriorityAverageDepth(priorityBuckets, priorityDepthSums, 3, 4);
  const depth68 = kronosPriorityAverageDepth(priorityBuckets, priorityDepthSums, 6, 8);
  const lateFaces = [...priorityBuckets[10], ...priorityBuckets[11]];
  let lateIndex = 0;
  const output: KronosPainterTriangle[] = [];
  const drainLateFacesAbove = (depth: number): void => {
    while (lateIndex < lateFaces.length && lateFaces[lateIndex].depth > depth) {
      output.push(lateFaces[lateIndex]);
      lateIndex += 1;
    }
  };

  for (let priority = 0; priority < 10; priority += 1) {
    if (priority === 0) {
      drainLateFacesAbove(depth12);
    } else if (priority === 3) {
      drainLateFacesAbove(depth34);
    } else if (priority === 5) {
      drainLateFacesAbove(depth68);
    }
    output.push(...priorityBuckets[priority]);
  }
  while (lateIndex < lateFaces.length) {
    output.push(lateFaces[lateIndex]);
    lateIndex += 1;
  }
  return output;
}

function kronosPriorityAverageDepth(
  buckets: readonly (readonly KronosPainterTriangle[])[],
  sums: readonly number[],
  leftPriority: number,
  rightPriority: number
): number {
  const count = buckets[leftPriority].length + buckets[rightPriority].length;
  return count > 0 ? (sums[leftPriority] + sums[rightPriority]) / count : 0;
}

function updateKronosAnimatedTexture(texture: Texture, clientCycle: number): void {
  const direction = texture.userData.kronosAnimationDirection as number | undefined;
  const speed = texture.userData.kronosAnimationSpeed as number | undefined;
  if (!direction || !speed) {
    return;
  }

  const width = Math.max(1, Number(texture.userData.kronosTextureWidth) || KRONOS_TEXTURE_SIZE);
  const height = Math.max(1, Number(texture.userData.kronosTextureHeight) || KRONOS_TEXTURE_SIZE);
  const horizontal = positiveModulo((speed * clientCycle) / width, 1);
  const vertical = positiveModulo((speed * clientCycle) / height, 1);

  if (direction === 1) {
    texture.offset.y = -vertical;
  } else if (direction === 3) {
    texture.offset.y = vertical;
  } else if (direction === 2) {
    texture.offset.x = -horizontal;
  } else if (direction === 4) {
    texture.offset.x = horizontal;
  }
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function buildRasterizer3dColorPalette(brightness: number, start: number, end: number): readonly number[] {
  const palette = new Array<number>(65536).fill(1);
  let paletteIndex = start * 128;

  for (let index = start; index < end; index += 1) {
    const hue = (index >> 3) / 64 + 0.0078125;
    const saturation = (index & 7) / 8 + 0.0625;

    for (let lightnessIndex = 0; lightnessIndex < 128; lightnessIndex += 1) {
      const lightness = lightnessIndex / 128;
      const [red, green, blue] = hslToRgb(hue, saturation, lightness);
      const rgb =
        (Math.floor(Math.pow(red, brightness) * 256) << 16) |
        (Math.floor(Math.pow(green, brightness) * 256) << 8) |
        Math.floor(Math.pow(blue, brightness) * 256);
      palette[paletteIndex] = rgb === 0 ? 1 : rgb;
      paletteIndex += 1;
    }
  }

  return palette;
}

function hslToRgb(hue: number, saturation: number, lightness: number): readonly [number, number, number] {
  if (saturation === 0) {
    return [lightness, lightness, lightness];
  }

  const high = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const low = 2 * lightness - high;
  return [
    hueToRgb(low, high, hue + 1 / 3),
    hueToRgb(low, high, hue),
    hueToRgb(low, high, hue - 1 / 3)
  ];
}

function hueToRgb(low: number, high: number, hue: number): number {
  let normalizedHue = hue;
  if (normalizedHue < 0) {
    normalizedHue += 1;
  }
  if (normalizedHue > 1) {
    normalizedHue -= 1;
  }
  if (normalizedHue * 6 < 1) {
    return low + (high - low) * 6 * normalizedHue;
  }
  if (normalizedHue * 2 < 1) {
    return high;
  }
  if (normalizedHue * 3 < 2) {
    return low + (high - low) * (2 / 3 - normalizedHue) * 6;
  }
  return low;
}
