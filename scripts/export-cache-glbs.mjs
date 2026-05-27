import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetFixtureRoot = path.join(projectRoot, "fixtures", "assets");
const renderFixtureRoot = path.join(projectRoot, "fixtures", "render");
const modelOutputDir = path.join(assetFixtureRoot, "models");
const loadoutOutputDir = path.join(renderFixtureRoot, "player-loadouts");
const spotanimOutputDir = path.join(renderFixtureRoot, "spotanims");
const cacheItemsPath = path.join(assetFixtureRoot, "defs", "cache-items.json");
const serverItemsPath = path.join(assetFixtureRoot, "defs", "server-items.json");
const kitsPath = path.join(assetFixtureRoot, "defs", "kits.json");
const spotanimsPath = path.join(assetFixtureRoot, "defs", "spotanims.json");
const cacheModelsPath = path.join(assetFixtureRoot, "models", "cache-models.json");

const canonicalNhLoadoutItemIds = {
  "kodai-robes": [12929, 21791, 12002, 21006, 4712, 6889, 4714, 7462, 11840, 19710, 21948],
  "acb-hides": [12929, 22109, 19547, 11785, 11828, 6889, 11830, 7462, 11840, 19710, 21948],
  "tentacle-bandos": [12929, 6570, 19553, 12006, 11832, 22322, 11834, 7462, 11840, 19710, 21948],
  "ags-bandos": [12929, 6570, 19553, 11802, 11832, 11834, 7462, 11840, 19710, 21948],
  "gmaul-bandos": [12929, 6570, 19553, 4153, 11832, 11834, 7462, 11840, 19710, 21948]
};

const gearExports = [
  { output: "abyssal_tentacle.glb", label: "Abyssal tentacle", itemIds: [12006] },
  { output: "armadyl_crossbow.glb", label: "Armadyl crossbow", itemIds: [11785] },
  { output: "armadyl_godsword.glb", label: "Armadyl godsword", itemIds: [11802] },
  { output: "kodai_wand.glb", label: "Kodai wand", itemIds: [21006] },
  { output: "granite_maul.glb", label: "Granite maul", itemIds: [4153] },
  { output: "ahrims_magic_gear.glb", label: "Canonical NH magic gear", itemIds: canonicalNhLoadoutItemIds["kodai-robes"] },
  { output: "armadyl_ranged_gear.glb", label: "Canonical NH ranged gear", itemIds: canonicalNhLoadoutItemIds["acb-hides"] },
  { output: "bandos_tentacle_gear.glb", label: "Canonical NH tentacle gear", itemIds: canonicalNhLoadoutItemIds["tentacle-bandos"] },
  { output: "bandos_ags_gear.glb", label: "Canonical NH AGS gear", itemIds: canonicalNhLoadoutItemIds["ags-bandos"] },
  { output: "bandos_body.glb", label: "Bandos chestplate and tassets", itemIds: [11832, 11834] },
  { output: "karils_leather.glb", label: "Karil's leathertop and leatherskirt", itemIds: [4736, 4738] },
  { output: "ancestral_robes.glb", label: "Ancestral robe top and bottom", itemIds: [21018, 21021, 21024] }
];

const loadoutExports = [
  { output: "tentacle-bandos.glb", label: "Tentacle Bandos NH bot loadout", itemIds: canonicalNhLoadoutItemIds["tentacle-bandos"] },
  { output: "ags-bandos.glb", label: "Armadyl godsword Bandos NH bot loadout", itemIds: canonicalNhLoadoutItemIds["ags-bandos"] },
  { output: "gmaul-bandos.glb", label: "Granite maul Bandos NH bot loadout", itemIds: canonicalNhLoadoutItemIds["gmaul-bandos"] },
  { output: "acb-hides.glb", label: "Armadyl crossbow NH bot loadout", itemIds: canonicalNhLoadoutItemIds["acb-hides"] },
  { output: "kodai-robes.glb", label: "Kodai Ahrim's NH bot loadout", itemIds: canonicalNhLoadoutItemIds["kodai-robes"] }
];

const spotanimExports = [
  { output: "ice_blitz_cast.glb", label: "Ice blitz cast spotanim", spotanimId: 366 },
  { output: "ice_blitz_hit.glb", label: "Ice blitz hit spotanim", spotanimId: 367 },
  { output: "ice_barrage_projectile.glb", label: "Ice barrage projectile spotanim", spotanimId: 368 },
  { output: "ice_barrage_hit.glb", label: "Ice barrage hit spotanim", spotanimId: 369 },
  { output: "blood_blitz_projectile.glb", label: "Blood blitz projectile spotanim", spotanimId: 374 },
  { output: "blood_blitz_hit.glb", label: "Blood blitz hit spotanim", spotanimId: 375 },
  { output: "blood_barrage_hit.glb", label: "Blood barrage hit spotanim", spotanimId: 377 },
  { output: "ags_special.glb", label: "Armadyl godsword special spotanim", spotanimId: 1211 },
  { output: "gmaul_special.glb", label: "Granite maul special spotanim", spotanimId: 340 },
  { output: "acb_special_projectile.glb", label: "Armadyl crossbow special projectile spotanim", spotanimId: 301 },
  { output: "bolt_projectile.glb", label: "Bolt projectile spotanim", spotanimId: 27 },
  { output: "dragon_bolt_projectile.glb", label: "Dragon bolt projectile spotanim", spotanimId: 1468 }
];

const itemModelFields = ["maleModel0", "maleModel1", "maleModel2"];
const rasterizer3dBrightness = 0.9;
const rasterizer3dColorPalette = buildRasterizer3dColorPalette(rasterizer3dBrightness, 0, 512);
const defaultMaleBodyParts = [
  { bodyPartId: 0, equipmentSlot: 8, label: "hair" },
  { bodyPartId: 1, equipmentSlot: 11, label: "jaw" },
  { bodyPartId: 2, equipmentSlot: 4, label: "torso" },
  { bodyPartId: 3, equipmentSlot: 6, label: "arms" },
  { bodyPartId: 4, equipmentSlot: 9, label: "hands" },
  { bodyPartId: 5, equipmentSlot: 7, label: "legs" },
  { bodyPartId: 6, equipmentSlot: 10, label: "feet" }
];

function toSignedShort(value) {
  const unsigned = value & 0xffff;
  return unsigned > 0x7fff ? unsigned - 0x10000 : unsigned;
}

function applyRecolors(color, source) {
  const find = source.colorFind ?? source.recolorToFind ?? [];
  const replace = source.colorReplace ?? source.recolorToReplace ?? [];
  const signedColor = toSignedShort(color);

  for (let i = 0; i < find.length; i += 1) {
    if (signedColor === toSignedShort(find[i])) {
      return toSignedShort(replace[i]);
    }
  }

  return signedColor;
}

function rs2hslToRgba(color, alpha = 0) {
  const rgb = rasterizer3dColorPalette[color & 0xffff] ?? 1;
  const alphaByte = unsignedByte(alpha);
  return [
    ((rgb >> 16) & 0xff) / 255,
    ((rgb >> 8) & 0xff) / 255,
    (rgb & 0xff) / 255,
    alphaByte === 0 ? 1 : 1 - alphaByte / 255
  ];
}

function unsignedByte(value = 0) {
  return value & 0xff;
}

function buildRasterizer3dColorPalette(brightness, start, end) {
  const palette = new Array(65536).fill(1);
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

function hslToRgb(hue, saturation, lightness) {
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

function hueToRgb(low, high, hue) {
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

function itemModelIds(item) {
  return itemModelFields
    .map((field) => item[field])
    .filter((modelId) => Number.isInteger(modelId) && modelId >= 0);
}

function kitModelIds(kit) {
  return (kit.modelIds ?? []).filter((modelId) => Number.isInteger(modelId) && modelId >= 0);
}

function createMesh() {
  return {
    positions: [],
    colors: [],
    indices: [],
    sourceModels: [],
    sourceVertexGroups: [],
    sourceFaceAlphaGroups: [],
    sourceFaceAlphas: [],
    expandedToSourceVertex: [],
    expandedToSourceFace: []
  };
}

function modelVertexGroups(model) {
  const vertexCount = model.vertexCount ?? model.vertexPositionsX?.length ?? 0;
  const groups = new Array(vertexCount).fill(-1);

  for (const [groupId, vertices] of Object.entries(model.vertexGroups ?? [])) {
    for (const vertexIndex of vertices ?? []) {
      if (vertexIndex >= 0 && vertexIndex < groups.length) {
        groups[vertexIndex] = Number(groupId);
      }
    }
  }

  return groups;
}

function appendModelGeometry(mesh, model, recolorSource) {
  const faceCount = model.faceCount ?? model.faceVertexIndices1?.length ?? 0;
  const sourceVertexBase = mesh.sourceVertexGroups.length;
  const sourceFaceBase = mesh.sourceFaceAlphaGroups.length;
  const sourceVertexGroups = modelVertexGroups(model);
  const faceDrawOrder = nhFaceRenderPriorityOrder(model, faceCount);
  const litFaces = createClientPlayerFaceColors(model, faceCount, (faceIndex) =>
    applyRecolors(model.faceColors[faceIndex], recolorSource)
  );

  for (const group of sourceVertexGroups) {
    mesh.sourceVertexGroups.push(group);
  }

  for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
    const alpha = model.faceAlphas?.[faceIndex] ?? 0;
    mesh.sourceFaceAlphaGroups.push(model.faceSkins?.[faceIndex] ?? -1);
    mesh.sourceFaceAlphas.push(unsignedByte(alpha));
  }

  for (const faceIndex of faceDrawOrder) {
    const litFace = litFaces[faceIndex];
    if (!litFace) {
      continue;
    }
    const vertexIndices = [
      model.faceVertexIndices1[faceIndex],
      model.faceVertexIndices2[faceIndex],
      model.faceVertexIndices3[faceIndex]
    ];
    const alpha = model.faceAlphas?.[faceIndex] ?? 0;
    const colors = litFace.map((color) => rs2hslToRgba(color, alpha));

    for (let vertexOffset = 0; vertexOffset < vertexIndices.length; vertexOffset += 1) {
      const vertexIndex = vertexIndices[vertexOffset];
      mesh.positions.push(
        model.vertexPositionsX[vertexIndex],
        -model.vertexPositionsY[vertexIndex],
        model.vertexPositionsZ[vertexIndex]
      );
      mesh.colors.push(...colors[vertexOffset]);
      mesh.expandedToSourceVertex.push(sourceVertexBase + vertexIndex);
      mesh.expandedToSourceFace.push(sourceFaceBase + faceIndex);
    }

    const triangleBase = mesh.positions.length / 3 - 3;
    mesh.indices.push(triangleBase, triangleBase + 2, triangleBase + 1);
  }
}

function nhFaceRenderPriorityOrder(model, faceCount) {
  if (!model.faceRenderPriorities?.length) {
    return Array.from({ length: faceCount }, (_, faceIndex) => faceIndex);
  }

  const priorityBuckets = Array.from({ length: 10 }, () => []);
  const deferredFaces = [];
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
    const priority = model.faceRenderPriorities[faceIndex] ?? 0;
    if (priority >= 0 && priority < priorityBuckets.length) {
      priorityBuckets[priority].push(faceIndex);
    } else {
      deferredFaces.push(faceIndex);
    }
  }

  return [...priorityBuckets.flat(), ...deferredFaces];
}

function createClientPlayerFaceColors(model, faceCount, faceColor) {
  const lighting = createClientModelDataLighting(model, faceCount);
  return Array.from({ length: faceCount }, (_, faceIndex) => {
    const renderType = clientModelRenderType(model, faceIndex);
    const texture = -1;
    const color = faceColor(faceIndex) & 0xffff;

    if (texture === -1) {
      if (renderType === 0) {
        return [
          clientAdjustHslLightness(color, clientVertexLightness(model, lighting, faceIndex, 0)),
          clientAdjustHslLightness(color, clientVertexLightness(model, lighting, faceIndex, 1)),
          clientAdjustHslLightness(color, clientVertexLightness(model, lighting, faceIndex, 2))
        ];
      }
      if (renderType === 1) {
        const lightness = clientFaceLightness(lighting.faceNormals[faceIndex]);
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
        clientClampLightness(clientVertexLightness(model, lighting, faceIndex, 0)),
        clientClampLightness(clientVertexLightness(model, lighting, faceIndex, 1)),
        clientClampLightness(clientVertexLightness(model, lighting, faceIndex, 2))
      ];
    }
    if (renderType === 1) {
      const flatColor = clientClampLightness(clientFaceLightness(lighting.faceNormals[faceIndex]));
      return [flatColor, flatColor, flatColor];
    }
    return null;
  });
}

function createClientModelDataLighting(model, faceCount) {
  const vertexCount = model.vertexCount ?? model.vertexPositionsX?.length ?? 0;
  const vertexNormals = Array.from({ length: vertexCount }, () => ({ x: 0, y: 0, z: 0, magnitude: 0 }));
  const faceNormals = new Array(faceCount);

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

function clientModelRenderType(model, faceIndex) {
  const alpha = signedByte(model.faceAlphas?.[faceIndex] ?? 0);
  if (alpha === -2) {
    return 3;
  }
  if (alpha === -1) {
    return 2;
  }
  return model.faceRenderTypes?.[faceIndex] ?? 0;
}

const clientPlayerModelAmbient = 64;
const clientPlayerModelContrast = 850;
const clientPlayerModelLightX = -30;
const clientPlayerModelLightY = -50;
const clientPlayerModelLightZ = -30;
const clientPlayerModelLightMagnitude = Math.trunc(
  Math.sqrt(
    clientPlayerModelLightX * clientPlayerModelLightX +
      clientPlayerModelLightY * clientPlayerModelLightY +
      clientPlayerModelLightZ * clientPlayerModelLightZ
  )
);
const clientPlayerModelLightDenominator = (clientPlayerModelLightMagnitude * clientPlayerModelContrast) >> 8;

function clientVertexLightness(model, lighting, faceIndex, vertexOffset) {
  const vertexIndex =
    vertexOffset === 0
      ? model.faceVertexIndices1[faceIndex]
      : vertexOffset === 1
        ? model.faceVertexIndices2[faceIndex]
        : model.faceVertexIndices3[faceIndex];
  const normal = lighting.vertexNormals[vertexIndex];
  const magnitude = Math.max(1, normal.magnitude);
  return (
    Math.trunc(
      (clientPlayerModelLightY * normal.y +
        clientPlayerModelLightZ * normal.z +
        clientPlayerModelLightX * normal.x) /
        (clientPlayerModelLightDenominator * magnitude)
    ) + clientPlayerModelAmbient
  );
}

function clientFaceLightness(normal) {
  if (!normal) {
    return clientPlayerModelAmbient;
  }
  return (
    Math.trunc(
      (clientPlayerModelLightY * normal.y +
        clientPlayerModelLightZ * normal.z +
        clientPlayerModelLightX * normal.x) /
        (Math.trunc(clientPlayerModelLightDenominator / 2) + clientPlayerModelLightDenominator)
    ) + clientPlayerModelAmbient
  );
}

function clientAdjustHslLightness(color, lightness) {
  return (color & 65408) + clientClampLightness(((color & 127) * lightness) >> 7);
}

function clientClampLightness(lightness) {
  if (lightness < 2) {
    return 2;
  }
  if (lightness > 126) {
    return 126;
  }
  return lightness;
}

function signedByte(value = 0) {
  const unsigned = value & 0xff;
  return unsigned > 0x7f ? unsigned - 0x100 : unsigned;
}

function appendItem(mesh, models, cacheItems, itemId) {
  const item = cacheItems[itemId];
  if (!item) {
    throw new Error(`missing cache item ${itemId}`);
  }

  for (const modelId of itemModelIds(item)) {
    const model = models[modelId];
    if (!model) {
      throw new Error(`missing model ${modelId} for ${item.name} (${itemId})`);
    }
    appendModelGeometry(mesh, model, item);
    mesh.sourceModels.push({ kind: "item", itemId, itemName: item.name, modelId });
  }
}

function appendKit(mesh, models, kit, label) {
  for (const modelId of kitModelIds(kit)) {
    const model = models[modelId];
    if (!model) {
      throw new Error(`missing kit model ${modelId} for kit ${kit.id}`);
    }
    appendModelGeometry(mesh, model, kit);
    mesh.sourceModels.push({ kind: "kit", kitId: kit.id, bodyPartId: kit.bodyPartId, label, modelId });
  }
}

function assertHasGeometry(mesh, output) {
  if (mesh.indices.length === 0) {
    throw new Error(`no geometry exported for ${output}`);
  }
}

function buildGearMesh(cacheItems, models, exportDef) {
  const mesh = createMesh();

  for (const itemId of exportDef.itemIds) {
    appendItem(mesh, models, cacheItems, itemId);
  }

  assertHasGeometry(mesh, exportDef.output);
  return mesh;
}

function defaultMaleKits(kits) {
  return defaultMaleBodyParts.map((bodyPart) => {
    const kit = Object.values(kits).find(
      (candidate) => !candidate.nonSelectable && candidate.bodyPartId === bodyPart.bodyPartId
    );
    if (!kit) {
      throw new Error(`missing selectable male kit for body part ${bodyPart.bodyPartId}`);
    }
    return { ...bodyPart, kit };
  });
}

function buildLoadoutMesh(cacheItems, serverItems, kits, models, exportDef) {
  const mesh = createMesh();
  const itemSlotMap = new Map();
  const hiddenKitSlots = new Set();

  for (const itemId of exportDef.itemIds) {
    const serverItem = serverItems[itemId];
    if (!serverItem) {
      throw new Error(`missing server item ${itemId}`);
    }
    itemSlotMap.set(serverItem.equipSlot, serverItem);
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

  for (const bodyPart of defaultMaleKits(kits)) {
    if (!hiddenKitSlots.has(bodyPart.equipmentSlot)) {
      appendKit(mesh, models, bodyPart.kit, bodyPart.label);
    }
  }

  for (const itemId of exportDef.itemIds) {
    appendItem(mesh, models, cacheItems, itemId);
  }

  mesh.sourceModels.push({
    kind: "loadout-rule",
    hiddenKitSlots: [...hiddenKitSlots].sort((left, right) => left - right),
    equippedSlots: [...itemSlotMap.keys()].sort((left, right) => left - right)
  });
  assertHasGeometry(mesh, exportDef.output);
  return mesh;
}

function buildSpotanimMesh(spotanims, models, exportDef) {
  const spotanim = spotanims[exportDef.spotanimId];
  if (!spotanim) {
    throw new Error(`missing spotanim ${exportDef.spotanimId}`);
  }

  const model = models[spotanim.modelId];
  if (!model) {
    throw new Error(`missing model ${spotanim.modelId} for spotanim ${exportDef.spotanimId}`);
  }

  const mesh = createMesh();
  appendModelGeometry(mesh, model, spotanim);
  mesh.sourceModels.push({
    kind: "spotanim",
    spotanimId: exportDef.spotanimId,
    modelId: spotanim.modelId,
    animationId: spotanim.animationId,
    resizeX: spotanim.resizeX,
    resizeY: spotanim.resizeY,
    rotation: spotanim.rotaton
  });
  assertHasGeometry(mesh, exportDef.output);
  return mesh;
}

function minMax(values, stride) {
  const min = new Array(stride).fill(Number.POSITIVE_INFINITY);
  const max = new Array(stride).fill(Number.NEGATIVE_INFINITY);

  for (let i = 0; i < values.length; i += stride) {
    for (let axis = 0; axis < stride; axis += 1) {
      min[axis] = Math.min(min[axis], values[i + axis]);
      max[axis] = Math.max(max[axis], values[i + axis]);
    }
  }

  return { min, max };
}

function align4(length) {
  return (length + 3) & ~3;
}

function paddedBuffer(buffer, fill = 0) {
  const padded = Buffer.alloc(align4(buffer.length), fill);
  buffer.copy(padded);
  return padded;
}

function jsonBuffer(value) {
  return paddedBuffer(Buffer.from(JSON.stringify(value), "utf8"), 0x20);
}

function floatBuffer(values) {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return paddedBuffer(buffer);
}

function uintBuffer(values) {
  const componentType = values.some((value) => value > 65535) ? 5125 : 5123;
  const byteLength = values.length * (componentType === 5125 ? 4 : 2);
  const buffer = Buffer.alloc(byteLength);

  values.forEach((value, index) => {
    if (componentType === 5125) {
      buffer.writeUInt32LE(value, index * 4);
    } else {
      buffer.writeUInt16LE(value, index * 2);
    }
  });

  return { buffer: paddedBuffer(buffer), componentType };
}

function makeGlb(mesh, exportDef) {
  const positionBuffer = floatBuffer(mesh.positions);
  const colorBuffer = floatBuffer(mesh.colors);
  const indexResult = uintBuffer(mesh.indices);

  const positionOffset = 0;
  const colorOffset = positionOffset + positionBuffer.length;
  const indexOffset = colorOffset + colorBuffer.length;
  const binary = Buffer.concat([positionBuffer, colorBuffer, indexResult.buffer]);
  const positionBounds = minMax(mesh.positions, 3);

  const gltf = {
    asset: {
      version: "2.0",
      generator: "NhNHTrainer export-cache-glbs.mjs"
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: exportDef.label }],
    meshes: [
      {
        name: exportDef.label,
        primitives: [
          {
            attributes: {
              POSITION: 0,
              COLOR_0: 1
            },
            indices: 2,
            material: 0,
            mode: 4
          }
        ],
        extras: {
          source: "Nh cache ModelDefinition",
          sourceModels: mesh.sourceModels
        }
      }
    ],
    materials: [
      {
        name: "cache-face-colors",
        doubleSided: true,
        alphaMode: "OPAQUE",
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0,
          roughnessFactor: 1
        }
      }
    ],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: positionOffset, byteLength: positionBuffer.length, target: 34962 },
      { buffer: 0, byteOffset: colorOffset, byteLength: colorBuffer.length, target: 34962 },
      { buffer: 0, byteOffset: indexOffset, byteLength: indexResult.buffer.length, target: 34963 }
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: mesh.positions.length / 3,
        type: "VEC3",
        min: positionBounds.min,
        max: positionBounds.max
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: mesh.colors.length / 4,
        type: "VEC4",
        min: [0, 0, 0, 0],
        max: [1, 1, 1, 1]
      },
      {
        bufferView: 2,
        componentType: indexResult.componentType,
        count: mesh.indices.length,
        type: "SCALAR"
      }
    ]
  };

  return packGlb(gltf, binary);
}

function packGlb(gltf, binary) {
  const encodedJson = jsonBuffer(gltf);
  const totalLength = 12 + 8 + encodedJson.length + 8 + binary.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(encodedJson.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4);

  const binaryChunkHeader = Buffer.alloc(8);
  binaryChunkHeader.writeUInt32LE(binary.length, 0);
  binaryChunkHeader.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, jsonChunkHeader, encodedJson, binaryChunkHeader, binary]);
}

async function writeGlb(outputDir, exportDef, mesh) {
  const glb = makeGlb(mesh, exportDef);
  const outputPath = path.join(outputDir, exportDef.output);
  const metadataPath = outputPath.replace(/\.glb$/i, ".mesh.json");
  const relativeOutput = path.relative(projectRoot, outputPath).replaceAll("\\", "/");
  const relativeMetadata = path.relative(projectRoot, metadataPath).replaceAll("\\", "/");
  await writeFile(outputPath, glb);
  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        generatedBy: "scripts/export-cache-glbs.mjs",
        source: "Nh cache ModelDefinition vertexGroups mapped to exported GLB vertices",
        glb: relativeOutput,
        sourceVertexCount: mesh.sourceVertexGroups.length,
        expandedVertexCount: mesh.positions.length / 3,
        sourceVertexGroups: mesh.sourceVertexGroups,
        expandedToSourceVertex: mesh.expandedToSourceVertex,
        sourceFaceCount: mesh.sourceFaceAlphaGroups.length,
        sourceFaceAlphaGroups: mesh.sourceFaceAlphaGroups,
        sourceFaceAlphas: mesh.sourceFaceAlphas,
        expandedToSourceFace: mesh.expandedToSourceFace,
        sourceModels: mesh.sourceModels
      },
      null,
      2
    )}\n`
  );
  return {
    output: relativeOutput,
    meshMetadata: relativeMetadata,
    label: exportDef.label,
    itemIds: exportDef.itemIds,
    spotanimId: exportDef.spotanimId,
    sourceModels: mesh.sourceModels,
    vertices: mesh.positions.length / 3,
    triangles: mesh.indices.length / 3
  };
}

const cacheItems = JSON.parse(await readFile(cacheItemsPath, "utf8"));
const serverItems = Object.fromEntries(
  JSON.parse(await readFile(serverItemsPath, "utf8")).map((item) => [item.id, item])
);
const kits = JSON.parse(await readFile(kitsPath, "utf8"));
const spotanims = JSON.parse(await readFile(spotanimsPath, "utf8"));
const models = JSON.parse(await readFile(cacheModelsPath, "utf8"));
const manifest = [];

await mkdir(modelOutputDir, { recursive: true });
await mkdir(loadoutOutputDir, { recursive: true });
await mkdir(spotanimOutputDir, { recursive: true });

for (const exportDef of gearExports) {
  manifest.push(await writeGlb(modelOutputDir, exportDef, buildGearMesh(cacheItems, models, exportDef)));
}

for (const exportDef of loadoutExports) {
  manifest.push(
    await writeGlb(loadoutOutputDir, exportDef, buildLoadoutMesh(cacheItems, serverItems, kits, models, exportDef))
  );
}

for (const exportDef of spotanimExports) {
  manifest.push(await writeGlb(spotanimOutputDir, exportDef, buildSpotanimMesh(spotanims, models, exportDef)));
}

await writeFile(
  path.join(modelOutputDir, "cache-glb-manifest.json"),
  `${JSON.stringify({ generatedBy: "scripts/export-cache-glbs.mjs", exports: manifest }, null, 2)}\n`
);

console.log(`exported ${manifest.length} cache-backed GLBs`);
