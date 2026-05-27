export const NH_TILE_MODEL_VERTEX_TYPES = [
  [1, 3, 5, 7],
  [1, 3, 5, 7],
  [1, 3, 5, 7],
  [1, 3, 5, 7, 6],
  [1, 3, 5, 7, 6],
  [1, 3, 5, 7, 6],
  [1, 3, 5, 7, 6],
  [1, 3, 5, 7, 2, 6],
  [1, 3, 5, 7, 2, 8],
  [1, 3, 5, 7, 2, 8],
  [1, 3, 5, 7, 11, 12],
  [1, 3, 5, 7, 11, 12],
  [1, 3, 5, 7, 13, 14]
];

export const NH_TILE_MODEL_FACE_TYPES = [
  [0, 1, 2, 3, 0, 0, 1, 3],
  [1, 1, 2, 3, 1, 0, 1, 3],
  [0, 1, 2, 3, 1, 0, 1, 3],
  [0, 0, 1, 2, 0, 0, 2, 4, 1, 0, 4, 3],
  [0, 0, 1, 4, 0, 0, 4, 3, 1, 1, 2, 4],
  [0, 0, 4, 3, 1, 0, 1, 2, 1, 0, 2, 4],
  [0, 1, 2, 4, 1, 0, 1, 4, 1, 0, 4, 3],
  [0, 4, 1, 2, 0, 4, 2, 5, 1, 0, 4, 5, 1, 0, 5, 3],
  [0, 4, 1, 2, 0, 4, 2, 3, 0, 4, 3, 5, 1, 0, 4, 5],
  [0, 0, 4, 5, 1, 4, 1, 2, 1, 4, 2, 3, 1, 4, 3, 5],
  [0, 0, 1, 5, 0, 1, 4, 5, 0, 1, 2, 4, 1, 0, 5, 3, 1, 5, 4, 3, 1, 4, 2, 3],
  [1, 0, 1, 5, 1, 1, 4, 5, 1, 1, 2, 4, 0, 0, 5, 3, 0, 5, 4, 3, 0, 4, 2, 3],
  [1, 0, 5, 4, 1, 0, 1, 5, 0, 0, 4, 3, 0, 4, 5, 3, 0, 5, 2, 3, 0, 1, 2, 5]
];

const tileSize = 128;
const halfTile = tileSize / 2;
const quarterTile = tileSize / 4;
const threeQuarterTile = (tileSize * 3) / 4;

export function createNhTileModel(options) {
  const shape = options.shape;
  const rotation = options.rotation & 3;
  const vertexTypes = NH_TILE_MODEL_VERTEX_TYPES[shape];
  const faceTypes = NH_TILE_MODEL_FACE_TYPES[shape];
  if (!vertexTypes || !faceTypes) {
    throw new Error(`unsupported Nh TileModel shape ${shape}`);
  }

  const tileX = options.tileX ?? 0;
  const tileY = options.tileY ?? 0;
  const baseX = tileSize * tileX;
  const baseY = tileSize * tileY;
  const heights = {
    sw: options.heightSw,
    nw: options.heightNw,
    ne: options.heightNe,
    se: options.heightSe
  };
  const underlayColors = {
    sw: options.underlaySwColor,
    nw: options.underlayNwColor,
    ne: options.underlayNeColor,
    se: options.underlaySeColor
  };
  const overlayColors = {
    sw: options.overlaySwColor,
    nw: options.overlayNwColor,
    ne: options.overlayNeColor,
    se: options.overlaySeColor
  };
  const vertices = [];
  const underlayVertexColors = [];
  const overlayVertexColors = [];

  for (const vertexType of vertexTypes) {
    const rotatedType = rotateTileVertexType(vertexType, rotation);
    const vertex = tileModelVertex(rotatedType, baseX, baseY, heights, underlayColors, overlayColors);
    vertices.push({
      type: rotatedType,
      x: vertex.x,
      y: vertex.height,
      z: vertex.z
    });
    underlayVertexColors.push(vertex.underlayColor);
    overlayVertexColors.push(vertex.overlayColor);
  }

  const faces = [];
  for (let index = 0; index < faceTypes.length; index += 4) {
    const surface = faceTypes[index];
    const indices = [
      rotateFaceCorner(faceTypes[index + 1], rotation),
      rotateFaceCorner(faceTypes[index + 2], rotation),
      rotateFaceCorner(faceTypes[index + 3], rotation)
    ];
    const colors = surface === 0 ? underlayVertexColors : overlayVertexColors;
    faces.push({
      surface,
      indices,
      texture: surface === 0 ? -1 : options.texture ?? -1,
      colors: indices.map((vertexIndex) => colors[vertexIndex])
    });
  }

  return {
    shape,
    rotation,
    texture: options.texture ?? -1,
    underlayRgb: options.underlayRgb ?? 0,
    overlayRgb: options.overlayRgb ?? 0,
    isFlat: heights.sw === heights.nw && heights.sw === heights.ne && heights.se === heights.sw,
    vertices,
    faces
  };
}

function rotateTileVertexType(vertexType, rotation) {
  if ((vertexType & 1) === 0 && vertexType <= 8) {
    return ((vertexType - rotation - rotation - 1) & 7) + 1;
  }

  if (vertexType > 8 && vertexType <= 12) {
    return ((vertexType - 9 - rotation) & 3) + 9;
  }

  if (vertexType > 12 && vertexType <= 16) {
    return ((vertexType - 13 - rotation) & 3) + 13;
  }

  return vertexType;
}

function rotateFaceCorner(vertexIndex, rotation) {
  return vertexIndex < 4 ? (vertexIndex - rotation) & 3 : vertexIndex;
}

function tileModelVertex(vertexType, baseX, baseY, heights, underlayColors, overlayColors) {
  switch (vertexType) {
    case 1:
      return corner(baseX, baseY, heights.sw, underlayColors.sw, overlayColors.sw);
    case 2:
      return corner(
        baseX + halfTile,
        baseY,
        averageValue(heights.nw, heights.sw),
        averageValue(underlayColors.nw, underlayColors.sw),
        averageValue(overlayColors.nw, overlayColors.sw)
      );
    case 3:
      return corner(baseX + tileSize, baseY, heights.nw, underlayColors.nw, overlayColors.nw);
    case 4:
      return corner(
        baseX + tileSize,
        baseY + halfTile,
        averageValue(heights.ne, heights.nw),
        averageValue(underlayColors.nw, underlayColors.ne),
        averageValue(overlayColors.nw, overlayColors.ne)
      );
    case 5:
      return corner(baseX + tileSize, baseY + tileSize, heights.ne, underlayColors.ne, overlayColors.ne);
    case 6:
      return corner(
        baseX + halfTile,
        baseY + tileSize,
        averageValue(heights.ne, heights.se),
        averageValue(underlayColors.se, underlayColors.ne),
        averageValue(overlayColors.se, overlayColors.ne)
      );
    case 7:
      return corner(baseX, baseY + tileSize, heights.se, underlayColors.se, overlayColors.se);
    case 8:
      return corner(
        baseX,
        baseY + halfTile,
        averageValue(heights.se, heights.sw),
        averageValue(underlayColors.se, underlayColors.sw),
        averageValue(overlayColors.se, overlayColors.sw)
      );
    case 9:
      return corner(
        baseX + halfTile,
        baseY + quarterTile,
        averageValue(heights.nw, heights.sw),
        averageValue(underlayColors.nw, underlayColors.sw),
        averageValue(overlayColors.nw, overlayColors.sw)
      );
    case 10:
      return corner(
        baseX + threeQuarterTile,
        baseY + halfTile,
        averageValue(heights.ne, heights.nw),
        averageValue(underlayColors.nw, underlayColors.ne),
        averageValue(overlayColors.nw, overlayColors.ne)
      );
    case 11:
      return corner(
        baseX + halfTile,
        baseY + threeQuarterTile,
        averageValue(heights.ne, heights.se),
        averageValue(underlayColors.se, underlayColors.ne),
        averageValue(overlayColors.se, overlayColors.ne)
      );
    case 12:
      return corner(
        baseX + quarterTile,
        baseY + halfTile,
        averageValue(heights.se, heights.sw),
        averageValue(underlayColors.se, underlayColors.sw),
        averageValue(overlayColors.se, overlayColors.sw)
      );
    case 13:
      return corner(baseX + quarterTile, baseY + quarterTile, heights.sw, underlayColors.sw, overlayColors.sw);
    case 14:
      return corner(baseX + threeQuarterTile, baseY + quarterTile, heights.nw, underlayColors.nw, overlayColors.nw);
    case 15:
      return corner(baseX + threeQuarterTile, baseY + threeQuarterTile, heights.ne, underlayColors.ne, overlayColors.ne);
    default:
      return corner(baseX + quarterTile, baseY + threeQuarterTile, heights.se, underlayColors.se, overlayColors.se);
  }
}

function corner(x, z, height, underlayColor, overlayColor) {
  return { x, z, height, underlayColor, overlayColor };
}

function averageValue(left, right) {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.map((value, index) => (value + right[index]) / 2);
  }

  return (left + right) >> 1;
}
