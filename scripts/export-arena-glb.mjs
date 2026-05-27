import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNhTileModel } from "./nh-tile-model.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arenaJsonPath = path.join(projectRoot, "fixtures", "render", "maps", "inferno_arena.json");
const arenaObjectsPath = path.join(projectRoot, "fixtures", "render", "maps", "inferno_arena_objects.json");
const cacheModelsPath = path.join(projectRoot, "fixtures", "assets", "models", "cache-models.json");
const textureDefsPath = path.join(projectRoot, "fixtures", "assets", "defs", "textures.json");
const floorDefsPath = path.join(projectRoot, "fixtures", "assets", "defs", "floors.json");
const terrainOutputPath = path.join(projectRoot, "fixtures", "render", "maps", "inferno_arena.glb");
const objectOutputPath = path.join(projectRoot, "fixtures", "render", "maps", "inferno_arena_objects.glb");

const tileScale = 0.5;
const modelUnitScale = tileScale / 128;
const terrainHeightScale = 0.08 / 128;
const colorPalette = buildColorPalette(0.9, 0, 512);
const clientTransparentTerrainColor = 12345678;

function underlayHsl(underlay) {
  if (!underlay) {
    return null;
  }
  return packFloorHsl(underlay.hue, underlay.saturation, underlay.lightness);
}

function rgbIntToRgba(rgb, alpha = 0) {
  return [
    ((rgb >> 16) & 0xff) / 255,
    ((rgb >> 8) & 0xff) / 255,
    (rgb & 0xff) / 255,
    alpha === 0 ? 1 : 1 - alpha / 255
  ];
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function terrainPaletteRgba(hsl, lightness) {
  if (hsl === null || hsl === undefined) {
    return clientTransparentTerrainColor;
  }
  const paletteIndex = method1792(hsl, lightness);
  return paletteIndex === clientTransparentTerrainColor ? clientTransparentTerrainColor : paletteRgba(paletteIndex);
}

function terrainTextureLightRgba(lightness) {
  const normalized = clampLightness(lightness) / 126;
  return [normalized, normalized, normalized, 1];
}

function paletteRgba(index) {
  return rgbIntToRgba(colorPalette[index] ?? 0);
}

function packFloorHsl(hue, saturation, lightness) {
  let packedSaturation = saturation;
  if (lightness > 179) {
    packedSaturation = Math.floor(packedSaturation / 2);
  }
  if (lightness > 192) {
    packedSaturation = Math.floor(packedSaturation / 2);
  }
  if (lightness > 217) {
    packedSaturation = Math.floor(packedSaturation / 2);
  }
  if (lightness > 243) {
    packedSaturation = Math.floor(packedSaturation / 2);
  }
  return (Math.floor(packedSaturation / 32) << 7) + (Math.floor(hue / 4) << 10) + Math.floor(lightness / 2);
}

function method1792(hsl, lightness) {
  if (hsl === -1) {
    return clientTransparentTerrainColor;
  }
  const adjusted = clampLightness(((hsl & 127) * lightness) / 128);
  return (hsl & 65408) + adjusted;
}

function clampLightness(value) {
  return Math.max(2, Math.min(126, Math.floor(value)));
}

function buildColorPalette(brightness, start, end) {
  const palette = new Array(65536).fill(1);
  let paletteIndex = start * 128;

  for (let i = start; i < end; i += 1) {
    const hue = (i >> 3) / 64 + 0.0078125;
    const saturation = (i & 7) / 8 + 0.0625;

    for (let lightnessIndex = 0; lightnessIndex < 128; lightnessIndex += 1) {
      const lightness = lightnessIndex / 128;
      const [red, green, blue] = hslToRgb(hue, saturation, lightness);
      const rgb =
        Math.floor(Math.pow(red, brightness) * 256) << 16 |
        Math.floor(Math.pow(green, brightness) * 256) << 8 |
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
  let shiftedHue = hue;
  if (shiftedHue > 1) {
    shiftedHue -= 1;
  }
  if (shiftedHue < 0) {
    shiftedHue += 1;
  }
  if (6 * shiftedHue < 1) {
    return low + (high - low) * 6 * shiftedHue;
  }
  if (2 * shiftedHue < 1) {
    return high;
  }
  if (3 * shiftedHue < 2) {
    return low + (high - low) * (2 / 3 - shiftedHue) * 6;
  }
  return low;
}

function toSignedShort(value) {
  const unsigned = value & 0xffff;
  return unsigned > 0x7fff ? unsigned - 0x10000 : unsigned;
}

function applyRecolors(color, source) {
  const find = source.recolorToFind ?? source.recolorFrom ?? [];
  const replace = source.recolorToReplace ?? source.recolorTo ?? [];
  const signedColor = toSignedShort(color);

  for (let i = 0; i < find.length; i += 1) {
    if (signedColor === toSignedShort(find[i])) {
      return toSignedShort(replace[i]);
    }
  }

  return signedColor;
}

function rs2hsbToRgba(color, alpha = 0) {
  const hsb = color & 0xffff;
  const hue = ((hsb >> 10) & 0x3f) / 63;
  const saturation = ((hsb >> 7) & 0x07) / 7;
  const brightness = (hsb & 0x7f) / 127;
  const [r, g, b] = hsbToRgb(hue, saturation, brightness);
  return [r, g, b, alpha === 0 ? 1 : 1 - alpha / 255];
}

function textureAverageRgba(textureId, textureDefs, alpha) {
  const texture = textureDefs.get(textureId);
  if (!texture) {
    return null;
  }
  return rs2hsbToRgba(texture.averageHsl, alpha);
}

function applyRetextures(textureId, source) {
  const find = source.retextureToFind ?? source.retextureFrom ?? [];
  const replace = source.textureToReplace ?? source.retextureTo ?? [];
  const signedTextureId = toSignedShort(textureId);

  for (let i = 0; i < find.length; i += 1) {
    if (signedTextureId === toSignedShort(find[i])) {
      return toSignedShort(replace[i]);
    }
  }

  return signedTextureId;
}

function faceTextureId(model, faceIndex, placement) {
  const textureId = model.faceTextures?.[faceIndex] ?? -1;
  return textureId >= 0 ? applyRetextures(textureId, placement) : -1;
}

function modelFaceRenderType(model, faceIndex) {
  let renderType = model.faceRenderTypes?.[faceIndex] ?? 0;
  const alpha = model.faceAlphas?.[faceIndex] ?? 0;
  if (alpha === -2) {
    renderType = 3;
  } else if (alpha === -1) {
    renderType = 2;
  }
  return renderType;
}

function modelFaceNormalRenderType(model, faceIndex) {
  return model.faceRenderTypes?.[faceIndex] ?? 0;
}

function clientLightingAdjustedHsl(color, brightness) {
  const unsignedColor = color & 0xffff;
  const lightness = clampLightness(((unsignedColor & 127) * brightness) >> 7);
  return (unsignedColor & 65408) + lightness;
}

function clientTextureLightness(brightness) {
  return clampLightness(brightness);
}

function clientObjectLightScale(placement) {
  const contrast = (placement.contrast ?? 0) + 768;
  const lightMagnitude = Math.trunc(Math.sqrt(50 * 50 + 10 * 10 + 50 * 50));
  return Math.max(1, (lightMagnitude * contrast) >> 8);
}

function clientObjectLightness(normal, placement, flat = false) {
  const ambient = (placement.ambient ?? 0) + 64;
  const lightScale = clientObjectLightScale(placement);
  const denominator = flat ? lightScale + Math.trunc(lightScale / 2) : lightScale * Math.max(1, normal.magnitude);
  const directional = -50 * normal.x + -10 * normal.y + -50 * normal.z;
  return Math.trunc(directional / denominator) + ambient;
}

function clientModelNormalForFace(vertices, vertexIndices) {
  const a = vertices[vertexIndices[0]];
  const b = vertices[vertexIndices[1]];
  const c = vertices[vertexIndices[2]];
  const ab = {
    x: b.x - a.x,
    y: b.y - a.y,
    z: b.z - a.z
  };
  const ac = {
    x: c.x - a.x,
    y: c.y - a.y,
    z: c.z - a.z
  };
  let x = ab.y * ac.z - ac.y * ab.z;
  let y = ab.z * ac.x - ac.z * ab.x;
  let z = ab.x * ac.y - ac.x * ab.y;

  while (x > 8192 || y > 8192 || z > 8192 || x < -8192 || y < -8192 || z < -8192) {
    x >>= 1;
    y >>= 1;
    z >>= 1;
  }

  let magnitude = Math.trunc(Math.sqrt(x * x + y * y + z * z));
  if (magnitude <= 0) {
    magnitude = 1;
  }

  return {
    x: Math.trunc((x * 256) / magnitude),
    y: Math.trunc((y * 256) / magnitude),
    z: Math.trunc((z * 256) / magnitude),
    magnitude: 1
  };
}

function createClientModelLighting(model, placement) {
  const vertexCount = model.vertexCount ?? model.vertexPositionsX?.length ?? 0;
  const faceCount = model.faceCount ?? model.faceVertexIndices1?.length ?? 0;
  const vertices = Array.from({ length: vertexCount }, (_, vertexIndex) =>
    clientObjectVertex(
      model.vertexPositionsX[vertexIndex],
      model.vertexPositionsY[vertexIndex],
      model.vertexPositionsZ[vertexIndex],
      placement
    )
  );
  const vertexNormals = Array.from({ length: vertexCount }, () => ({ x: 0, y: 0, z: 0, magnitude: 0 }));
  const faceNormals = new Array(faceCount).fill(null);

  for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
    const vertexIndices = sourceFaceVertexIndices(model, faceIndex, placement);
    const normal = clientModelNormalForFace(vertices, vertexIndices);
    if (modelFaceNormalRenderType(model, faceIndex) === 0) {
      for (const vertexIndex of vertexIndices) {
        const vertexNormal = vertexNormals[vertexIndex];
        vertexNormal.x += normal.x;
        vertexNormal.y += normal.y;
        vertexNormal.z += normal.z;
        vertexNormal.magnitude += 1;
      }
    } else if (modelFaceNormalRenderType(model, faceIndex) === 1) {
      faceNormals[faceIndex] = normal;
    }
  }

  return { vertexNormals, faceNormals };
}

function sourceFaceVertexIndices(model, faceIndex, placement) {
  const sourceVertexIndices = [
    model.faceVertexIndices1[faceIndex],
    model.faceVertexIndices2[faceIndex],
    model.faceVertexIndices3[faceIndex]
  ];
  return clientObjectMirrorsModel(placement)
    ? [sourceVertexIndices[2], sourceVertexIndices[1], sourceVertexIndices[0]]
    : sourceVertexIndices;
}

function clientObjectFaceColors(model, faceIndex, vertexIndices, placement, lighting, textureDefs) {
  const alpha = model.faceAlphas?.[faceIndex] ?? 0;
  const textureId = faceTextureId(model, faceIndex, placement);
  const hasTextureImage = textureId >= 0 && Boolean(textureDefs.get(textureId)?.image);
  if (hasTextureImage) {
    return vertexIndices.map(() => [1, 1, 1, alpha === 0 ? 1 : 1 - alpha / 255]);
  }

  const textureColor = textureId >= 0 ? textureAverageRgba(textureId, textureDefs, alpha) : null;
  if (textureColor) {
    return vertexIndices.map((vertexIndex) => {
      const brightness = clientObjectLightness(lighting.vertexNormals[vertexIndex], placement);
      const lightness = clientTextureLightness(brightness) / 126;
      return [
        clamp01(textureColor[0] * lightness),
        clamp01(textureColor[1] * lightness),
        clamp01(textureColor[2] * lightness),
        textureColor[3]
      ];
    });
  }

  const color = applyRecolors(model.faceColors[faceIndex], placement);
  const renderType = modelFaceRenderType(model, faceIndex);
  if (renderType === 1) {
    const normal = lighting.faceNormals[faceIndex] ?? lighting.vertexNormals[vertexIndices[0]];
    const brightness = clientObjectLightness(normal, placement, true);
    const rgba = paletteRgba(clientLightingAdjustedHsl(color, brightness));
    rgba[3] = alpha === 0 ? 1 : 1 - alpha / 255;
    return vertexIndices.map(() => rgba);
  }
  if (renderType === 3) {
    const rgba = paletteRgba(128);
    rgba[3] = alpha === 0 ? 1 : 1 - alpha / 255;
    return vertexIndices.map(() => rgba);
  }

  return vertexIndices.map((vertexIndex) => {
    const brightness = clientObjectLightness(lighting.vertexNormals[vertexIndex], placement);
    const rgba = paletteRgba(clientLightingAdjustedHsl(color, brightness));
    rgba[3] = alpha === 0 ? 1 : 1 - alpha / 255;
    return rgba;
  });
}

function faceUvs(model, faceIndex) {
  const u = model.faceTextureUCoordinates?.[faceIndex] ?? [0, 1, 0];
  const v = model.faceTextureVCoordinates?.[faceIndex] ?? [1, 1, 0];
  return [
    [u[0] ?? 0, v[0] ?? 1],
    [u[1] ?? 1, v[1] ?? 1],
    [u[2] ?? 0, v[2] ?? 0]
  ];
}

function hsbToRgb(hue, saturation, brightness) {
  if (saturation === 0) {
    return [brightness, brightness, brightness];
  }

  const sector = hue * 6;
  const index = Math.floor(sector);
  const fraction = sector - index;
  const p = brightness * (1 - saturation);
  const q = brightness * (1 - saturation * fraction);
  const t = brightness * (1 - saturation * (1 - fraction));

  switch (index % 6) {
    case 0:
      return [brightness, t, p];
    case 1:
      return [q, brightness, p];
    case 2:
      return [p, brightness, t];
    case 3:
      return [p, q, brightness];
    case 4:
      return [t, p, brightness];
    default:
      return [brightness, p, q];
  }
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

function buildArenaMesh(arena, floorDefs, textureDefs) {
  const mesh = createMesh();
  const blendedUnderlays = buildBlendedUnderlayHsl(arena, floorDefs);
  const terrainLightness = buildClientTerrainLightness(arena);
  const tilePaintMaterialKey = registerMaterial(mesh, "terrain:tilepaint", {
    name: "cache-terrain-tilepaint-faces",
    kind: "vertex",
    sceneLayer: "terrain",
    unlit: true
  });
  const tileModelMaterialKey = registerMaterial(mesh, "terrain:tilemodel", {
    name: "cache-terrain-tilemodel-faces",
    kind: "vertex",
    sceneLayer: "terrain",
    unlit: true
  });

  for (const tile of arena.tiles) {
    const shape = tile.overlayId > 0 ? tile.overlayPath + 1 : 0;
    if (shape === 0) {
      appendTilePaintSurface(mesh, tilePaintMaterialKey, tile, arena, underlayCornerColors(tile, floorDefs, blendedUnderlays, terrainLightness));
    } else if (shape === 1) {
      const textureId = overlayTextureId(tile, floorDefs);
      const materialKey =
        textureId >= 0 && textureDefs.get(textureId)?.image
          ? terrainTextureMaterialKey(mesh, "tilepaint", textureId, textureDefs)
          : tilePaintMaterialKey;
      appendTilePaintSurface(
        mesh,
        materialKey,
        tile,
        arena,
        overlayCornerColors(tile, floorDefs, textureDefs, terrainLightness),
        materialKey === tilePaintMaterialKey ? undefined : terrainTexturePaintUvs()
      );
    } else {
      appendTileModelTerrain(mesh, tileModelMaterialKey, tile, arena, floorDefs, textureDefs, blendedUnderlays, terrainLightness);
    }
  }

  return mesh;
}

function buildBlendedUnderlayHsl(arena, floorDefs) {
  const blendRadius = 5;
  const tiles = new Map(arena.tiles.map((tile) => [`${tile.x}:${tile.y}:${tile.plane}`, tile]));
  const hslByTile = new Map();

  for (const tile of arena.tiles) {
    let hue = 0;
    let saturation = 0;
    let lightness = 0;
    let hueMultiplier = 0;
    let count = 0;

    for (let y = tile.y - blendRadius; y <= tile.y + blendRadius; y += 1) {
      for (let x = tile.x - blendRadius; x <= tile.x + blendRadius; x += 1) {
        const neighbor = tiles.get(`${x}:${y}:${tile.plane}`);
        const underlay = neighbor?.underlayId > 0 ? floorDefs.underlays.get(neighbor.underlayId - 1) : null;
        if (!underlay) {
          continue;
        }
        hue += underlay.hue;
        saturation += underlay.saturation;
        lightness += underlay.lightness;
        hueMultiplier += underlay.hueMultiplier;
        count += 1;
      }
    }

    if (count === 0 || hueMultiplier === 0) {
      continue;
    }

    const packed = packFloorHsl(
      Math.floor((hue * 256) / hueMultiplier),
      Math.floor(saturation / count),
      Math.max(0, Math.min(255, Math.floor(lightness / count)))
    );
    hslByTile.set(`${tile.x}:${tile.y}:${tile.plane}`, packed);
  }

  return hslByTile;
}

function buildClientTerrainLightness(arena) {
  const heightByCorner = rawTileHeightByKey(arena);
  const lightness = new Map();
  const vectorLength = Math.trunc(Math.sqrt(5100));
  const scaledLightLength = vectorLength * 768 >> 8;

  for (let plane = arena.bounds.plane; plane <= arena.bounds.plane; plane += 1) {
    for (let y = arena.bounds.south; y <= arena.bounds.north; y += 1) {
      for (let x = arena.bounds.west; x <= arena.bounds.east; x += 1) {
        const eastWestDelta =
          rawTileHeightAtCorner(heightByCorner, arena, x + 1, y, plane) -
          rawTileHeightAtCorner(heightByCorner, arena, x - 1, y, plane);
        const northSouthDelta =
          rawTileHeightAtCorner(heightByCorner, arena, x, y + 1, plane) -
          rawTileHeightAtCorner(heightByCorner, arena, x, y - 1, plane);
        const normalLength = Math.trunc(Math.sqrt(northSouthDelta * northSouthDelta + eastWestDelta * eastWestDelta + 65536));
        const normalX = Math.trunc((eastWestDelta << 8) / normalLength);
        const normalY = Math.trunc(65536 / normalLength);
        const normalZ = Math.trunc((northSouthDelta << 8) / normalLength);
        const baseLight = Math.trunc((normalX * -50 + normalZ * -50 + normalY * -10) / scaledLightLength) + 96;
        lightness.set(`${x}:${y}:${plane}`, baseLight);
      }
    }
  }

  return lightness;
}

function rawTileHeightByKey(arena) {
  const heights = new Map();
  for (const tile of arena.tiles) {
    const tileHeights = tile.heights ?? {};
    heights.set(`${tile.x}:${tile.y}:${tile.plane}`, tileHeights.southWest ?? tile.height);
    heights.set(`${tile.x + 1}:${tile.y}:${tile.plane}`, tileHeights.southEast ?? tile.height);
    heights.set(`${tile.x + 1}:${tile.y + 1}:${tile.plane}`, tileHeights.northEast ?? tile.height);
    heights.set(`${tile.x}:${tile.y + 1}:${tile.plane}`, tileHeights.northWest ?? tile.height);
  }
  return heights;
}

function rawTileHeightAtCorner(heights, arena, x, y, plane) {
  const clampedX = Math.max(arena.bounds.west, Math.min(arena.bounds.east, x));
  const clampedY = Math.max(arena.bounds.south, Math.min(arena.bounds.north, y));
  return heights.get(`${clampedX}:${clampedY}:${plane}`) ?? 0;
}

function terrainCornerLightness(lightness, x, y, plane) {
  return lightness.get(`${x}:${y}:${plane}`) ?? 96;
}

function terrainTileCornerLightness(tile, lightness) {
  return {
    southWest: terrainCornerLightness(lightness, tile.x, tile.y, tile.plane),
    southEast: terrainCornerLightness(lightness, tile.x + 1, tile.y, tile.plane),
    northEast: terrainCornerLightness(lightness, tile.x + 1, tile.y + 1, tile.plane),
    northWest: terrainCornerLightness(lightness, tile.x, tile.y + 1, tile.plane)
  };
}

function underlayCornerColors(tile, floorDefs, blendedUnderlays, terrainLightness) {
  const underlay = tile.underlayId > 0 ? floorDefs.underlays.get(tile.underlayId - 1) : null;
  const hsl = blendedUnderlays.get(`${tile.x}:${tile.y}:${tile.plane}`) ?? underlayHsl(underlay);
  const lightness = terrainTileCornerLightness(tile, terrainLightness);
  return {
    southWest: terrainPaletteRgba(hsl, lightness.southWest),
    southEast: terrainPaletteRgba(hsl, lightness.southEast),
    northEast: terrainPaletteRgba(hsl, lightness.northEast),
    northWest: terrainPaletteRgba(hsl, lightness.northWest)
  };
}

function overlayCornerColors(tile, floorDefs, textureDefs, terrainLightness) {
  const overlay = tile.overlayId > 0 ? floorDefs.overlays.get(tile.overlayId - 1) : null;
  const textureId = overlayTextureId(tile, floorDefs);
  const hsl = textureId >= 0 && textureDefs.get(textureId)?.image ? null : overlayHsl(overlay);
  const lightness = terrainTileCornerLightness(tile, terrainLightness);
  const colorAt = textureId >= 0 && textureDefs.get(textureId)?.image
    ? terrainTextureLightRgba
    : (cornerLightness) => terrainPaletteRgba(hsl, cornerLightness);
  return {
    southWest: colorAt(lightness.southWest),
    southEast: colorAt(lightness.southEast),
    northEast: colorAt(lightness.northEast),
    northWest: colorAt(lightness.northWest)
  };
}

function overlayHsl(overlay) {
  if (!overlay || overlay.rgbColor === 0xff00ff) {
    return null;
  }
  return overlay.secondaryRgbColor >= 0
    ? packFloorHsl(overlay.otherHue, overlay.otherSaturation, overlay.otherLightness)
    : packFloorHsl(overlay.hue, overlay.saturation, overlay.lightness);
}

function appendTilePaintSurface(mesh, materialKey, tile, arena, cornerColors, uvs = [[0, 0], [0, 0], [0, 0], [0, 0]]) {
  const x = (tile.x - arena.bounds.west) * tileScale;
  const z = (tile.y - arena.bounds.south) * tileScale;
  const heights = tileCornerHeights(tile);
  const vertices = [
    [x, heights.southWest, z],
    [x + tileScale, heights.southEast, z],
    [x + tileScale, heights.northEast, z + tileScale],
    [x, heights.northWest, z + tileScale]
  ];
  const colors = [
    cornerColors.southWest,
    cornerColors.southEast,
    cornerColors.northEast,
    cornerColors.northWest
  ];
  appendTilePaintTriangle(mesh, materialKey, vertices, colors, uvs, [2, 3, 1], colors[2]);
  appendTilePaintTriangle(mesh, materialKey, vertices, colors, uvs, [0, 1, 3], colors[0]);
}

function appendTileModelTerrain(mesh, materialKey, tile, arena, floorDefs, textureDefs, blendedUnderlays, terrainLightness) {
  const heights = tile.heights ?? {};
  const underlayColors = underlayCornerColors(tile, floorDefs, blendedUnderlays, terrainLightness);
  const overlayColors = overlayCornerColors(tile, floorDefs, textureDefs, terrainLightness);
  const model = createNhTileModel({
    shape: tile.overlayPath + 1,
    rotation: tile.overlayRotation,
    texture: tile.overlayId > 0 ? overlayTextureId(tile, floorDefs) : -1,
    tileX: tile.x - arena.bounds.west,
    tileY: tile.y - arena.bounds.south,
    heightSw: heights.southWest ?? tile.height,
    heightNw: heights.southEast ?? tile.height,
    heightNe: heights.northEast ?? tile.height,
    heightSe: heights.northWest ?? tile.height,
    underlaySwColor: underlayColors.southWest,
    underlayNwColor: underlayColors.southEast,
    underlayNeColor: underlayColors.northEast,
    underlaySeColor: underlayColors.northWest,
    overlaySwColor: overlayColors.southWest,
    overlayNwColor: overlayColors.southEast,
    overlayNeColor: overlayColors.northEast,
    overlaySeColor: overlayColors.northWest
  });

  for (const face of model.faces) {
    const materialForFace =
      face.texture >= 0 && textureDefs.get(face.texture)?.image
        ? terrainTextureMaterialKey(mesh, "tilemodel", face.texture, textureDefs)
        : materialKey;
    if (!materialHasTexture(mesh, materialForFace) && isTransparentTerrainColor(face.colors[0])) {
      continue;
    }
    const positions = face.indices.map((vertexIndex) => {
      const vertex = model.vertices[vertexIndex];
      return [vertex.x * modelUnitScale, terrainHeight(vertex.y), vertex.z * modelUnitScale];
    });
    const normal = upwardNormalForTriangle(positions[0], positions[1], positions[2]);
    const indices = [];
    for (let index = 0; index < positions.length; index += 1) {
      const uv =
        materialForFace === materialKey
          ? [0, 0]
          : terrainTextureModelUv(model.vertices[face.indices[index]], tile, arena);
      indices.push(appendMeshVertex(mesh, positions[index], normal, face.colors[index], uv));
    }
    appendPrimitiveIndices(mesh, materialForFace, indices);
  }
}

function appendTilePaintTriangle(mesh, materialKey, vertices, colors, uvs, vertexIndexes, gateColor) {
  if (!materialHasTexture(mesh, materialKey) && isTransparentTerrainColor(gateColor)) {
    return;
  }

  const positions = vertexIndexes.map((index) => vertices[index]);
  const normal = upwardNormalForTriangle(positions[0], positions[1], positions[2]);
  const indices = vertexIndexes.map((index) => appendMeshVertex(mesh, vertices[index], normal, colors[index], uvs[index]));
  appendPrimitiveIndices(mesh, materialKey, indices);
}

function isTransparentTerrainColor(color) {
  return color === clientTransparentTerrainColor;
}

function terrainTextureMaterialKey(mesh, surface, textureId, textureDefs) {
  const texture = textureDefs.get(textureId);
  if (!texture?.image) {
    throw new Error(`missing exported terrain texture ${textureId}`);
  }
  return registerMaterial(mesh, `terrain:${surface}:texture:${textureId}`, {
    name: `cache-terrain-${surface}-texture-${textureId}`,
    kind: "texture",
    sceneLayer: "terrain",
    unlit: true,
    textureId,
    imageUri: textureImageUri(texture)
  });
}

function terrainTexturePaintUvs() {
  return [
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0]
  ];
}

function terrainTextureModelUv(vertex, tile, arena) {
  const baseX = (tile.x - arena.bounds.west) * 128;
  const baseY = (tile.y - arena.bounds.south) * 128;
  const u = clamp01((vertex.x - baseX) / 128);
  const v = 1 - clamp01((vertex.z - baseY) / 128);
  return [u, v];
}

function overlayTextureId(tile, floorDefs) {
  const overlay = tile.overlayId > 0 ? floorDefs.overlays.get(tile.overlayId - 1) : null;
  return overlay?.texture ?? -1;
}

function terrainHeight(height) {
  return -height * terrainHeightScale;
}

function tileCornerHeights(tile) {
  const heights = tile.heights ?? {};
  return {
    southWest: terrainHeight(heights.southWest ?? tile.height),
    southEast: terrainHeight(heights.southEast ?? tile.height),
    northEast: terrainHeight(heights.northEast ?? tile.height),
    northWest: terrainHeight(heights.northWest ?? tile.height)
  };
}

function tileHeightByKey(arena) {
  const heights = new Map();
  for (const tile of arena.tiles) {
    const tileHeights = tileCornerHeights(tile);
    heights.set(`${tile.x}:${tile.y}:${tile.plane}`, tileHeights.southWest);
    heights.set(`${tile.x + 1}:${tile.y}:${tile.plane}`, tileHeights.southEast);
    heights.set(`${tile.x + 1}:${tile.y + 1}:${tile.plane}`, tileHeights.northEast);
    heights.set(`${tile.x}:${tile.y + 1}:${tile.plane}`, tileHeights.northWest);
  }
  return heights;
}

function sampleTerrainHeight(heights, worldX, worldY, plane) {
  const baseX = Math.floor(worldX);
  const baseY = Math.floor(worldY);
  const fracX = worldX - baseX;
  const fracY = worldY - baseY;
  const southWest = heights.get(`${baseX}:${baseY}:${plane}`) ?? 0;
  const southEast = heights.get(`${baseX + 1}:${baseY}:${plane}`) ?? southWest;
  const northEast = heights.get(`${baseX + 1}:${baseY + 1}:${plane}`) ?? southEast;
  const northWest = heights.get(`${baseX}:${baseY + 1}:${plane}`) ?? southWest;
  const south = lerp(southWest, southEast, fracX);
  const north = lerp(northWest, northEast, fracX);
  return lerp(south, north, fracY);
}

function tileHeightAtCorner(heights, worldX, worldY, plane, fallback) {
  return heights.get(`${worldX}:${worldY}:${plane}`) ?? fallback;
}

function clientObjectFootprint(placement) {
  const orientation = placement.orientation & 3;
  if (orientation === 1 || orientation === 3) {
    return { sizeX: placement.sizeY, sizeY: placement.sizeX };
  }
  return { sizeX: placement.sizeX, sizeY: placement.sizeY };
}

function clientObjectCenterHeight(placement, heights) {
  const footprint = clientObjectFootprint(placement);
  const centerX = placement.x + footprint.sizeX / 2;
  const centerY = placement.y + footprint.sizeY / 2;
  const fallback = sampleTerrainHeight(heights, centerX, centerY, placement.plane);
  const west = placement.x + (footprint.sizeX >> 1);
  const east = placement.x + ((footprint.sizeX + 1) >> 1);
  const south = placement.y + (footprint.sizeY >> 1);
  const north = placement.y + ((footprint.sizeY + 1) >> 1);

  return (
    tileHeightAtCorner(heights, east, north, placement.plane, fallback) +
    tileHeightAtCorner(heights, west, south, placement.plane, fallback) +
    tileHeightAtCorner(heights, east, south, placement.plane, fallback) +
    tileHeightAtCorner(heights, west, north, placement.plane, fallback)
  ) / 4;
}

function isObjectGroundContoured(placement) {
  return Number.isFinite(placement.contouredGround) && placement.contouredGround >= 0;
}

function clientObjectMirrorsModel(placement) {
  return Boolean(placement.isRotated);
}

function clientObjectVertex(x, y, z, placement) {
  let clientX = x;
  let clientZ = clientObjectMirrorsModel(placement) ? -z : z;
  const orientation = placement.orientation & 3;

  if (orientation === 1) {
    const previousX = clientX;
    clientX = clientZ;
    clientZ = -previousX;
  } else if (orientation === 2) {
    clientX = -clientX;
    clientZ = -clientZ;
  } else if (orientation === 3) {
    const previousZ = clientZ;
    clientZ = clientX;
    clientX = -previousZ;
  }

  return {
    x: clientX * (placement.modelSizeX / 128) + placement.offsetX,
    y: y * (placement.modelSizeHeight / 128) + placement.offsetHeight,
    z: clientZ * (placement.modelSizeY / 128) + placement.offsetY
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function createMesh() {
  return {
    positions: [],
    normals: [],
    colors: [],
    uvs: [],
    primitiveIndices: new Map(),
    materialDescriptors: new Map(),
    sourceObjects: []
  };
}

function registerMaterial(mesh, key, descriptor) {
  if (!mesh.materialDescriptors.has(key)) {
    mesh.materialDescriptors.set(key, { key, ...descriptor });
  }
  if (!mesh.primitiveIndices.has(key)) {
    mesh.primitiveIndices.set(key, []);
  }
  return key;
}

function appendPrimitiveIndices(mesh, materialKey, indices) {
  const primitive = mesh.primitiveIndices.get(materialKey);
  if (!primitive) {
    throw new Error(`missing material registration for ${materialKey}`);
  }
  primitive.push(...indices);
}

function materialHasTexture(mesh, materialKey) {
  return mesh.materialDescriptors.get(materialKey)?.kind === "texture";
}

function appendMeshVertex(mesh, position, normal, color, uv = [0, 0]) {
  const index = mesh.positions.length / 3;
  mesh.positions.push(...position);
  mesh.normals.push(...normal);
  mesh.colors.push(...color);
  mesh.uvs.push(uv[0], uv[1]);
  return index;
}

function transformObjectVertex(x, y, z, placement, arena, heights) {
  const footprint = clientObjectFootprint(placement);
  const vertex = clientObjectVertex(x, y, z, placement);
  const worldTileX = placement.x + footprint.sizeX / 2 + vertex.x / 128;
  const worldTileY = placement.y + footprint.sizeY / 2 + vertex.z / 128;
  const terrainY = isObjectGroundContoured(placement)
    ? sampleTerrainHeight(heights, worldTileX, worldTileY, placement.plane)
    : clientObjectCenterHeight(placement, heights);

  return [
    (worldTileX - arena.bounds.west) * tileScale,
    terrainY - vertex.y * modelUnitScale,
    (worldTileY - arena.bounds.south) * tileScale
  ];
}

function textureImageUri(texture) {
  const normalized = String(texture.image).replace(/\\/g, "/");
  return `../textures/${path.posix.basename(normalized)}`;
}

function clientSceneObjectLayer(placement) {
  return placement.type === 22 ? "floor-decoration" : "scene-object";
}

function objectFaceMaterialKey(mesh, textureId, textureDefs, placement) {
  const sceneLayer = clientSceneObjectLayer(placement);
  const texture = textureId >= 0 ? textureDefs.get(textureId) : null;
  if (texture?.image) {
    return registerMaterial(mesh, `${sceneLayer}:texture:${textureId}`, {
      name: `cache-${sceneLayer}-texture-${textureId}`,
      kind: "texture",
      sceneLayer,
      unlit: true,
      textureId,
      imageUri: textureImageUri(texture)
    });
  }

  return registerMaterial(mesh, `${sceneLayer}:vertex-color`, {
    name: `cache-${sceneLayer}-face-colors`,
    kind: "vertex",
    sceneLayer,
    unlit: true
  });
}

function appendObjectModelGeometry(mesh, model, placement, arena, heights, textureDefs) {
  const faceCount = model.faceCount ?? model.faceVertexIndices1?.length ?? 0;
  const lighting = createClientModelLighting(model, placement);

  for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
    const vertexIndices = sourceFaceVertexIndices(model, faceIndex, placement);
    const textureId = faceTextureId(model, faceIndex, placement);
    const materialKey = objectFaceMaterialKey(mesh, textureId, textureDefs, placement);
    const hasTextureImage = materialHasTexture(mesh, materialKey);
    const uvs = hasTextureImage ? faceUvs(model, faceIndex) : [[0, 0], [0, 0], [0, 0]];
    const colors = clientObjectFaceColors(model, faceIndex, vertexIndices, placement, lighting, textureDefs);
    const vertices = vertexIndices.map((vertexIndex) =>
      transformObjectVertex(
        model.vertexPositionsX[vertexIndex],
        model.vertexPositionsY[vertexIndex],
        model.vertexPositionsZ[vertexIndex],
        placement,
        arena,
        heights
      )
    );
    const normal = normalForTriangle(vertices[0], vertices[1], vertices[2]);
    const face = [];

    for (let vertexIndex = 0; vertexIndex < vertices.length; vertexIndex += 1) {
      face.push(appendMeshVertex(mesh, vertices[vertexIndex], normal, colors[vertexIndex], uvs[vertexIndex]));
    }

    appendPrimitiveIndices(mesh, materialKey, face);
  }
}

function normalForTriangle(a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0]
  ];
  const length = Math.hypot(normal[0], normal[1], normal[2]);
  if (length === 0) {
    return [0, 1, 0];
  }
  return [normal[0] / length, normal[1] / length, normal[2] / length];
}

function upwardNormalForTriangle(a, b, c) {
  const normal = normalForTriangle(a, b, c);
  return normal[1] < 0 ? [-normal[0], -normal[1], -normal[2]] : normal;
}

function buildArenaObjectMesh(arena, placements, models, textureDefs) {
  const mesh = createMesh();
  const heights = tileHeightByKey(arena);

  for (const placement of placements) {
    let appended = false;
    for (const modelId of placement.modelIds) {
      const model = models[modelId];
      if (!model) {
        continue;
      }
      appendObjectModelGeometry(mesh, model, placement, arena, heights, textureDefs);
      appended = true;
    }

    if (appended) {
      mesh.sourceObjects.push({
        id: placement.id,
        name: placement.name,
        type: placement.type,
        actions: placement.actions ?? [],
        animationId: placement.animationId,
        transformVarbit: placement.transformVarbit,
        transformVarp: placement.transformVarp,
        transforms: placement.transforms ?? [],
        orientation: placement.orientation,
        x: placement.x,
        y: placement.y,
        plane: placement.plane,
        modelIds: placement.modelIds
      });
    }
  }

  if (primitiveIndexCount(mesh) === 0) {
    throw new Error("no arena object geometry was exported");
  }

  return mesh;
}

function primitiveIndexCount(mesh) {
  let count = 0;
  for (const indices of mesh.primitiveIndices.values()) {
    count += indices.length;
  }
  return count;
}

function makeGlb(name, mesh, extras, materialName) {
  const vertexCount = mesh.positions.length / 3;
  if (mesh.normals.length !== mesh.positions.length || mesh.colors.length !== vertexCount * 4 || mesh.uvs.length !== vertexCount * 2) {
    throw new Error(`mesh attribute length mismatch while exporting ${name}`);
  }

  const primitiveEntries = [...mesh.primitiveIndices.entries()].filter(([, indices]) => indices.length > 0);
  if (primitiveEntries.length === 0) {
    throw new Error(`mesh has no primitives while exporting ${name}`);
  }

  const positionBuffer = floatBuffer(mesh.positions);
  const normalBuffer = floatBuffer(mesh.normals);
  const colorBuffer = floatBuffer(mesh.colors);
  const uvBuffer = floatBuffer(mesh.uvs);
  const indexResults = primitiveEntries.map(([key, indices]) => ({
    key,
    indices,
    ...uintBuffer(indices)
  }));
  const positionOffset = 0;
  const normalOffset = positionOffset + positionBuffer.length;
  const colorOffset = normalOffset + normalBuffer.length;
  const uvOffset = colorOffset + colorBuffer.length;
  let nextOffset = uvOffset + uvBuffer.length;
  const indexOffsets = [];
  for (const indexResult of indexResults) {
    indexOffsets.push(nextOffset);
    nextOffset += indexResult.buffer.length;
  }
  const binary = Buffer.concat([positionBuffer, normalBuffer, colorBuffer, uvBuffer, ...indexResults.map((result) => result.buffer)]);
  const positionBounds = minMax(mesh.positions, 3);
  const colorBounds = minMax(mesh.colors, 4);
  const uvBounds = minMax(mesh.uvs, 2);
  const images = [];
  const textures = [];
  const imageIndexByUri = new Map();

  function textureIndexForDescriptor(descriptor) {
    if (!descriptor.imageUri) {
      return -1;
    }

    let imageIndex = imageIndexByUri.get(descriptor.imageUri);
    if (imageIndex === undefined) {
      imageIndex = images.length;
      imageIndexByUri.set(descriptor.imageUri, imageIndex);
      images.push({ uri: descriptor.imageUri });
      textures.push({ sampler: 0, source: imageIndex });
    }
    return imageIndex;
  }

  const materialDescriptors = primitiveEntries.map(([key]) =>
    mesh.materialDescriptors.get(key) ?? { name: materialName, kind: "vertex" }
  );
  const materials = materialDescriptors.map((descriptor) => {
    const material = {
      name: descriptor.name ?? materialName,
      doubleSided: true,
      alphaMode: descriptor.kind === "texture" ? "MASK" : "OPAQUE",
      extras: {
        nhSceneLayer: descriptor.sceneLayer ?? "scene-object"
      },
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0,
        roughnessFactor: 1
      }
    };

    if (descriptor.unlit) {
      material.extensions = {
        KHR_materials_unlit: {}
      };
    }

    if (descriptor.kind === "texture") {
      material.alphaCutoff = 0.5;
      material.pbrMetallicRoughness.baseColorTexture = {
        index: textureIndexForDescriptor(descriptor)
      };
    }

    return material;
  });

  const gltf = {
    asset: { version: "2.0", generator: "NhNHTrainer export-arena-glb.mjs" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [
      {
        name,
        primitives: primitiveEntries.map(([, indices], index) => ({
          attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2, TEXCOORD_0: 3 },
          indices: 4 + index,
          material: index,
          mode: 4,
          extras: {
            indexCount: indices.length,
            materialKey: primitiveEntries[index][0]
          }
        })),
        extras
      }
    ],
    materials,
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: positionOffset, byteLength: positionBuffer.length, target: 34962 },
      { buffer: 0, byteOffset: normalOffset, byteLength: normalBuffer.length, target: 34962 },
      { buffer: 0, byteOffset: colorOffset, byteLength: colorBuffer.length, target: 34962 },
      { buffer: 0, byteOffset: uvOffset, byteLength: uvBuffer.length, target: 34962 },
      ...indexResults.map((indexResult, index) => ({
        buffer: 0,
        byteOffset: indexOffsets[index],
        byteLength: indexResult.buffer.length,
        target: 34963
      }))
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
        count: mesh.normals.length / 3,
        type: "VEC3",
        min: [-1, -1, -1],
        max: [1, 1, 1]
      },
      {
        bufferView: 2,
        componentType: 5126,
        count: mesh.colors.length / 4,
        type: "VEC4",
        min: colorBounds.min,
        max: colorBounds.max
      },
      {
        bufferView: 3,
        componentType: 5126,
        count: mesh.uvs.length / 2,
        type: "VEC2",
        min: uvBounds.min,
        max: uvBounds.max
      },
      ...indexResults.map((indexResult, index) => ({
        bufferView: 4 + index,
        componentType: indexResult.componentType,
        count: indexResult.indices.length,
        type: "SCALAR"
      }))
    ]
  };

  if (materialDescriptors.some((descriptor) => descriptor.unlit)) {
    gltf.extensionsUsed = ["KHR_materials_unlit"];
  }

  if (images.length > 0) {
    gltf.samplers = [{ magFilter: 9728, minFilter: 9728, wrapS: 10497, wrapT: 10497 }];
    gltf.images = images;
    gltf.textures = textures;
  }

  return packGlb(gltf, binary);
}

const arena = JSON.parse(await readFile(arenaJsonPath, "utf8"));
const placements = JSON.parse(await readFile(arenaObjectsPath, "utf8"));
const models = JSON.parse(await readFile(cacheModelsPath, "utf8"));
const textureMetadata = JSON.parse(await readFile(textureDefsPath, "utf8"));
const floorMetadata = JSON.parse(await readFile(floorDefsPath, "utf8"));
const textureDefs = new Map((textureMetadata.textures ?? []).map((texture) => [texture.id, texture]));
const floorDefs = {
  underlays: new Map((floorMetadata.underlays ?? []).map((underlay) => [underlay.id, underlay])),
  overlays: new Map((floorMetadata.overlays ?? []).map((overlay) => [overlay.id, overlay]))
};
const terrainMesh = buildArenaMesh(arena, floorDefs, textureDefs);
const objectMesh = buildArenaObjectMesh(arena, placements, models, textureDefs);
await mkdir(path.dirname(terrainOutputPath), { recursive: true });
await writeFile(
  terrainOutputPath,
  makeGlb(
    "NH wilderness arena cache terrain",
    terrainMesh,
    {
      source: arena.source,
      bounds: arena.bounds,
      tileCount: arena.tiles.length,
      floorUnderlayCount: floorDefs.underlays.size,
      floorOverlayCount: floorDefs.overlays.size
    },
    "cache-terrain-floor-definition-colors"
  )
);
await writeFile(
  objectOutputPath,
  makeGlb(
    "NH wilderness arena placed objects",
    objectMesh,
    {
      source: "Nh cache location archives plus ObjectDefinition model placements",
      bounds: arena.bounds,
      objectCount: objectMesh.sourceObjects.length,
      textureCount: textureDefs.size,
      sourceObjects: objectMesh.sourceObjects
    },
    "cache-object-face-colors-and-textures"
  )
);
console.log(
  `exported arena GLBs with ${arena.tiles.length} cache terrain tiles and ${objectMesh.sourceObjects.length} placed objects`
);
