import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultCacheRoot = path.join(os.homedir(), ".runelite", "jagexcache", "oldschool", "LIVE");
const defaultFixturePath = path.join(projectRoot, "fixtures", "external-items", "noxious-halberd.json");
const cacheRoot = path.resolve(valueAfter("--cache") ?? process.env.RUNELITE_CACHE_ROOT ?? defaultCacheRoot);
const fixturePath = path.resolve(valueAfter("--fixture") ?? defaultFixturePath);
const spotanimIdText = valueAfter("--spotanim");
const spotanimId = spotanimIdText === undefined ? null : Number.parseInt(spotanimIdText, 10);
const itemId = Number.parseInt(valueAfter("--item") ?? "29796", 10);
const skipSequences = process.argv.includes("--no-sequences");
const sequenceSpecs = skipSequences
  ? []
  : (valuesAfter("--sequence").length > 0 ? valuesAfter("--sequence") : ["440=halberd_attack"]).map(parseSequenceSpec);

if (!Number.isInteger(itemId) || itemId < 0) {
  throw new Error(`invalid --item value ${valueAfter("--item")}`);
}
if (spotanimId !== null && (!Number.isInteger(spotanimId) || spotanimId < 0)) {
  throw new Error(`invalid --spotanim value ${spotanimIdText}`);
}

const dat2Path = path.join(cacheRoot, "main_file_cache.dat2");
if (!existsSync(dat2Path)) {
  throw new Error(`missing live cache dat2 at ${dat2Path}`);
}

async function main() {
  const cache = new CurrentCacheReader(cacheRoot);
  try {
    if (spotanimId !== null) {
      await importCurrentCacheSpotanim(cache, spotanimId);
      return;
    }

    const configIndex = await cache.indexData(2);
    const itemArchive = configIndex.archive(10);
    if (!itemArchive) {
      throw new Error("current cache index 2 has no item config archive 10");
    }

    const itemFiles = splitArchiveFiles(await cache.decompressedArchive(2, 10), itemArchive.fileIds);
    const itemBytes = itemFiles.get(itemId);
    if (!itemBytes) {
      throw new Error(`current cache item archive does not contain item ${itemId}`);
    }

    const cacheItem = decodeItemDefinition(itemId, itemBytes);
    const modelIds = uniqueModelIds(cacheItem);
    const rawModels = new Map();
    for (const modelId of modelIds) {
      rawModels.set(modelId, await cache.decompressedArchive(7, modelId));
    }

    const cacheModels = await decodeModernModelDtos(rawModels);
    await updateExternalFixture(fixturePath, itemId, cacheItem, cacheModels);
    const importedSequences = await importCurrentCacheSequences(cache, sequenceSpecs);
    if (importedSequences.length > 0) {
      await mergeAnimationFixtures(importedSequences);
    }
    console.log(
      `imported item ${itemId} (${cacheItem.name}) from ${cacheRoot}: models ${modelIds.join(", ")}, sequences ${importedSequences
        .map((sequence) => `${sequence.id}:${sequence.name}`)
        .join(", ")} -> ${path.relative(projectRoot, fixturePath)}`
    );
  } finally {
    await cache.close();
  }
}

async function importCurrentCacheSpotanim(cache, targetSpotanimId) {
  const spotanimFiles = await cache.archiveFiles(2, 13);
  const spotanimBytes = spotanimFiles.get(targetSpotanimId);
  if (!spotanimBytes) {
    throw new Error(`current cache spotanim archive does not contain spotanim ${targetSpotanimId}`);
  }

  const spotanim = decodeSpotanimDefinition(targetSpotanimId, spotanimBytes);
  if (!Number.isInteger(spotanim.modelId) || spotanim.modelId < 0) {
    throw new Error(`spotanim ${targetSpotanimId} does not define a usable model id`);
  }

  const rawModels = new Map([[spotanim.modelId, await cache.decompressedArchive(7, spotanim.modelId)]]);
  const cacheModels = await decodeModernModelDtos(rawModels);
  await mergeCacheModelFixtures(cacheModels);
  await mergeSpotanimFixture(spotanim);

  const importedSequences =
    !skipSequences && Number.isInteger(spotanim.animationId) && spotanim.animationId > 0
      ? await importCurrentCacheSequences(cache, [{ id: spotanim.animationId, name: `spotanim_${targetSpotanimId}` }])
      : [];
  if (importedSequences.length > 0) {
    await mergeAnimationFixtures(importedSequences);
  }

  console.log(
    `imported spotanim ${targetSpotanimId}: model ${spotanim.modelId}, sequence ${spotanim.animationId} -> fixtures/assets/defs/spotanims.json`
  );
}

function valueAfter(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function valuesAfter(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1] !== undefined) {
      values.push(...process.argv[index + 1].split(",").map((value) => value.trim()).filter(Boolean));
      index += 1;
    }
  }
  return values;
}

function parseSequenceSpec(value) {
  const [idText, nameText] = value.split("=");
  const id = Number.parseInt(idText, 10);
  if (!Number.isInteger(id) || id < 0 || !nameText) {
    throw new Error(`invalid --sequence value ${value}; expected id=name`);
  }
  return { id, name: nameText };
}

function uniqueModelIds(cacheItem) {
  return [
    cacheItem.inventoryModel,
    cacheItem.maleModel0,
    cacheItem.maleModel1,
    cacheItem.maleModel2,
    cacheItem.femaleModel0,
    cacheItem.femaleModel1,
    cacheItem.femaleModel2
  ].filter((modelId, index, values) => Number.isInteger(modelId) && modelId >= 0 && values.indexOf(modelId) === index);
}

async function updateExternalFixture(targetPath, targetItemId, importedCacheItem, importedCacheModels) {
  const parsed = JSON.parse(await readFile(targetPath, "utf8"));
  const items = Array.isArray(parsed.items) ? parsed.items : [parsed];
  const item = items.find((candidate) => candidate.id === targetItemId);
  if (!item) {
    throw new Error(`fixture ${targetPath} does not contain item ${targetItemId}`);
  }

  item.sources = [...new Set([...(item.sources ?? []), "local:runelite-live-cache:item-and-model-definitions"])];
  item.cacheItem = {
    ...item.cacheItem,
    ...cacheItemForFixture(importedCacheItem),
    trainerExternalVisualFallback: undefined
  };
  delete item.cacheItem.trainerExternalVisualFallback;
  item.cacheModels = Object.fromEntries(
    [...importedCacheModels.entries()].map(([modelId, model]) => [String(modelId), model])
  );

  await writeFile(targetPath, `${JSON.stringify(parsed, null, 2)}\n`);
}

async function mergeCacheModelFixtures(importedCacheModels) {
  const cacheModelsPath = path.join(projectRoot, "fixtures", "assets", "models", "cache-models.json");
  const models = JSON.parse(await readFile(cacheModelsPath, "utf8"));
  for (const [modelId, model] of importedCacheModels.entries()) {
    models[String(modelId)] = model;
  }
  await writeFile(cacheModelsPath, `${JSON.stringify(models, null, 2)}\n`);
}

async function mergeSpotanimFixture(spotanim) {
  const spotanimPath = path.join(projectRoot, "fixtures", "assets", "defs", "spotanims.json");
  const spotanims = JSON.parse(await readFile(spotanimPath, "utf8"));
  spotanims[String(spotanim.id)] = spotanim;
  await writeFile(spotanimPath, `${JSON.stringify(spotanims, null, 2)}\n`);
}

function cacheItemForFixture(def) {
  return {
    id: def.id,
    name: def.name,
    resizeX: def.resizeX ?? 128,
    resizeY: def.resizeY ?? 128,
    resizeZ: def.resizeZ ?? 128,
    xan2d: def.xan2d ?? 0,
    yan2d: def.yan2d ?? 0,
    zan2d: def.zan2d ?? 0,
    cost: def.cost ?? 0,
    isTradeable: def.geTradeable === true,
    stackable: def.stackable ?? 0,
    inventoryModel: def.inventoryModel ?? -1,
    members: def.members === true,
    zoom2d: def.zoom2d ?? 2000,
    xOffset2d: def.xOffset2d ?? 0,
    yOffset2d: def.yOffset2d ?? 0,
    ambient: def.ambient ?? 0,
    contrast: def.contrast ?? 0,
    options: normalizeOptions(def.options),
    interfaceOptions: normalizeOptions(def.interfaceOptions),
    maleModel0: def.maleModel0 ?? -1,
    maleModel1: def.maleModel1 ?? -1,
    maleModel2: def.maleModel2 ?? -1,
    maleOffset: def.maleOffset ?? 0,
    maleHeadModel: def.maleHeadModel ?? -1,
    maleHeadModel2: def.maleHeadModel2 ?? -1,
    femaleModel0: def.femaleModel0 ?? -1,
    femaleModel1: def.femaleModel1 ?? -1,
    femaleModel2: def.femaleModel2 ?? -1,
    femaleOffset: def.femaleOffset ?? 0,
    femaleHeadModel: def.femaleHeadModel ?? -1,
    femaleHeadModel2: def.femaleHeadModel2 ?? -1,
    notedID: def.notedID ?? -1,
    notedTemplate: def.notedTemplate ?? -1,
    team: def.team ?? 0,
    shiftClickDropIndex: def.shiftClickDropIndex ?? -2,
    boughtId: def.boughtId ?? -1,
    boughtTemplateId: def.boughtTemplateId ?? -1,
    placeholderId: def.placeholderId ?? -1,
    placeholderTemplateId: def.placeholderTemplateId ?? -1,
    colorFind: def.colorFind,
    colorReplace: def.colorReplace,
    textureFind: def.textureFind,
    textureReplace: def.textureReplace,
    source: "local:runelite-live-cache"
  };
}

function normalizeOptions(options = []) {
  return Array.from({ length: 5 }, (_, index) => options[index] ?? null);
}

class CurrentCacheReader {
  constructor(root) {
    this.root = root;
    this.dat = null;
    this.indexCache = new Map();
  }

  async close() {
    if (this.dat !== null) {
      await this.dat.close();
      this.dat = null;
    }
  }

  async dataFile() {
    if (this.dat === null) {
      this.dat = await import("node:fs/promises").then((fs) => fs.open(path.join(this.root, "main_file_cache.dat2"), "r"));
    }
    return this.dat;
  }

  async indexData(indexId) {
    if (!this.indexCache.has(indexId)) {
      this.indexCache.set(indexId, parseIndexData(await this.decompressedArchive(255, indexId)));
    }
    return this.indexCache.get(indexId);
  }

  async decompressedArchive(indexId, archiveId) {
    return decompressContainer(await this.archive(indexId, archiveId));
  }

  async archiveFiles(indexId, archiveId) {
    const index = await this.indexData(indexId);
    const archive = index.archive(archiveId);
    if (!archive) {
      throw new Error(`missing cache index entry ${indexId}/${archiveId}`);
    }
    return splitArchiveFiles(await this.decompressedArchive(indexId, archiveId), archive.fileIds);
  }

  async archiveFile(indexId, archiveId, fileId) {
    const files = await this.archiveFiles(indexId, archiveId);
    const file = files.get(fileId);
    if (!file) {
      throw new Error(`missing cache archive file ${indexId}/${archiveId}/${fileId}`);
    }
    return file;
  }

  async archive(indexId, archiveId) {
    const entry = await this.indexEntry(indexId, archiveId);
    if (!entry || entry.length <= 0 || entry.sector <= 0) {
      throw new Error(`missing cache archive ${indexId}/${archiveId}`);
    }

    const dat = await this.dataFile();
    const output = Buffer.alloc(entry.length);
    let sector = entry.sector;
    let outputOffset = 0;
    let chunk = 0;

    while (outputOffset < entry.length) {
      const extendedArchiveId = archiveId > 0xffff;
      const headerSize = extendedArchiveId ? 10 : 8;
      const payloadLength = Math.min(520 - headerSize, entry.length - outputOffset);
      const sectorBuffer = Buffer.alloc(headerSize + payloadLength);
      await dat.read(sectorBuffer, 0, sectorBuffer.length, sector * 520);

      const actualArchiveId = extendedArchiveId ? sectorBuffer.readUInt32BE(0) : sectorBuffer.readUInt16BE(0);
      const actualChunk = extendedArchiveId ? sectorBuffer.readUInt16BE(4) : sectorBuffer.readUInt16BE(2);
      const nextSector = extendedArchiveId ? readMedium(sectorBuffer, 6) : readMedium(sectorBuffer, 4);
      const actualIndexId = extendedArchiveId ? sectorBuffer[9] : sectorBuffer[7];
      if (actualArchiveId !== archiveId || actualChunk !== chunk || actualIndexId !== indexId) {
        throw new Error(
          `cache sector mismatch for ${indexId}/${archiveId}: got ${actualIndexId}/${actualArchiveId}/${actualChunk}, expected ${indexId}/${archiveId}/${chunk}`
        );
      }

      sectorBuffer.copy(output, outputOffset, headerSize, headerSize + payloadLength);
      outputOffset += payloadLength;
      sector = nextSector;
      chunk += 1;
    }

    return output;
  }

  async indexEntry(indexId, archiveId) {
    const idxPath = path.join(this.root, `main_file_cache.idx${indexId}`);
    const idx = await import("node:fs/promises").then((fs) => fs.open(idxPath, "r"));
    try {
      const buffer = Buffer.alloc(6);
      const result = await idx.read(buffer, 0, 6, archiveId * 6);
      if (result.bytesRead !== 6) {
        return null;
      }
      return { length: readMedium(buffer, 0), sector: readMedium(buffer, 3) };
    } finally {
      await idx.close();
    }
  }
}

function parseIndexData(data) {
  const stream = new ByteStream(data);
  const protocol = stream.u8();
  if (protocol < 5 || protocol > 7) {
    throw new Error(`unsupported cache index protocol ${protocol}`);
  }
  if (protocol >= 6) {
    stream.i32();
  }
  const flags = stream.u8();
  const named = (flags & 1) !== 0;
  const sized = (flags & 4) !== 0;
  if ((flags & ~(1 | 4)) !== 0) {
    throw new Error(`unsupported cache index flags ${flags}`);
  }

  const archiveCount = protocol >= 7 ? stream.bigSmart() : stream.u16();
  const archives = [];
  let previousArchiveId = 0;
  for (let index = 0; index < archiveCount; index += 1) {
    previousArchiveId += protocol >= 7 ? stream.bigSmart() : stream.u16();
    archives.push({ id: previousArchiveId, fileIds: [] });
  }

  if (named) {
    for (const archive of archives) {
      archive.nameHash = stream.i32();
    }
  }
  for (const archive of archives) {
    archive.crc = stream.i32();
  }
  if (sized) {
    for (const archive of archives) {
      archive.compressedSize = stream.i32();
      archive.decompressedSize = stream.i32();
    }
  }
  for (const archive of archives) {
    archive.revision = stream.i32();
  }

  const fileCounts = archives.map(() => (protocol >= 7 ? stream.bigSmart() : stream.u16()));
  for (let archiveIndex = 0; archiveIndex < archives.length; archiveIndex += 1) {
    let previousFileId = 0;
    for (let fileIndex = 0; fileIndex < fileCounts[archiveIndex]; fileIndex += 1) {
      previousFileId += protocol >= 7 ? stream.bigSmart() : stream.u16();
      archives[archiveIndex].fileIds.push(previousFileId);
    }
  }
  if (named) {
    for (let archiveIndex = 0; archiveIndex < archives.length; archiveIndex += 1) {
      archives[archiveIndex].fileNameHashes = [];
      for (let fileIndex = 0; fileIndex < fileCounts[archiveIndex]; fileIndex += 1) {
        archives[archiveIndex].fileNameHashes.push(stream.i32());
      }
    }
  }

  return {
    archives,
    archive(id) {
      return archives.find((archive) => archive.id === id) ?? null;
    }
  };
}

function splitArchiveFiles(data, fileIds) {
  if (fileIds.length === 1) {
    return new Map([[fileIds[0], data]]);
  }

  const chunks = data[data.length - 1];
  const tableOffset = data.length - 1 - chunks * fileIds.length * 4;
  const chunkSizes = Array.from({ length: fileIds.length }, () => []);
  const fileSizes = new Array(fileIds.length).fill(0);
  let offset = tableOffset;

  for (let chunk = 0; chunk < chunks; chunk += 1) {
    let chunkSize = 0;
    for (let fileIndex = 0; fileIndex < fileIds.length; fileIndex += 1) {
      chunkSize += data.readInt32BE(offset);
      offset += 4;
      chunkSizes[fileIndex][chunk] = chunkSize;
      fileSizes[fileIndex] += chunkSize;
    }
  }

  const files = fileSizes.map((size) => Buffer.alloc(size));
  const fileOffsets = new Array(fileIds.length).fill(0);
  offset = 0;
  for (let chunk = 0; chunk < chunks; chunk += 1) {
    for (let fileIndex = 0; fileIndex < fileIds.length; fileIndex += 1) {
      const chunkSize = chunkSizes[fileIndex][chunk];
      data.copy(files[fileIndex], fileOffsets[fileIndex], offset, offset + chunkSize);
      fileOffsets[fileIndex] += chunkSize;
      offset += chunkSize;
    }
  }

  return new Map(fileIds.map((fileId, index) => [fileId, files[index]]));
}

function decompressContainer(data) {
  const compression = data[0];
  const compressedLength = data.readInt32BE(1);
  if (compression === 0) {
    return data.subarray(5, 5 + compressedLength);
  }

  const payload = data.subarray(5, 5 + compressedLength + 4);
  const expectedLength = payload.readInt32BE(0);
  const compressed = payload.subarray(4);
  const decompressed =
    compression === 1 ? decompressBzip2(compressed) : compression === 2 ? zlib.gunzipSync(compressed) : null;
  if (!decompressed) {
    throw new Error(`unsupported cache container compression ${compression}`);
  }
  if (decompressed.length !== expectedLength) {
    throw new Error(`cache container length mismatch ${decompressed.length}/${expectedLength}`);
  }
  return decompressed;
}

function decompressBzip2(payload) {
  const input = Buffer.concat([Buffer.from("BZh1"), payload]);
  for (const command of ["py", "python"]) {
    const result = spawnSync(
      command,
      ["-c", "import sys,bz2; sys.stdout.buffer.write(bz2.decompress(sys.stdin.buffer.read()))"],
      { input, maxBuffer: 100 * 1024 * 1024 }
    );
    if (result.status === 0) {
      return result.stdout;
    }
  }
  throw new Error("unable to decompress BZip2 cache container; Python with bz2 is required");
}

function decodeItemDefinition(id, data) {
  const stream = new ByteStream(data);
  const def = {
    id,
    options: Array(5).fill(null),
    interfaceOptions: Array(5).fill(null),
    inventoryModel: -1,
    maleModel0: -1,
    maleModel1: -1,
    maleModel2: -1,
    femaleModel0: -1,
    femaleModel1: -1,
    femaleModel2: -1
  };

  while (true) {
    const opcode = stream.u8();
    if (opcode === 0) {
      return def;
    }
    decodeItemOpcode(opcode, def, stream);
  }
}

function decodeSpotanimDefinition(id, data) {
  const stream = new ByteStream(data);
  const def = {
    id,
    modelId: -1,
    animationId: -1,
    resizeX: 128,
    resizeY: 128,
    rotaton: 0,
    ambient: 0,
    contrast: 0
  };

  while (true) {
    const opcode = stream.u8();
    if (opcode === 0) {
      return def;
    }
    decodeSpotanimOpcode(opcode, def, stream);
  }
}

function decodeSpotanimOpcode(opcode, def, stream) {
  if (opcode === 1) def.modelId = stream.u16();
  else if (opcode === 2) def.animationId = stream.u16();
  else if (opcode === 3) def.modelId = stream.i32();
  else if (opcode === 4) def.resizeX = stream.u16();
  else if (opcode === 5) def.resizeY = stream.u16();
  else if (opcode === 6) def.rotaton = stream.u16();
  else if (opcode === 7) def.ambient = stream.u8();
  else if (opcode === 8) def.contrast = stream.u8();
  else if (opcode === 9) def.debugName = stream.string();
  else if (opcode === 40) {
    const count = stream.u8();
    def.recolorToFind = [];
    def.recolorToReplace = [];
    for (let index = 0; index < count; index += 1) {
      def.recolorToFind.push(stream.u16());
      def.recolorToReplace.push(stream.u16());
    }
  } else if (opcode === 41) {
    const count = stream.u8();
    def.textureToFind = [];
    def.textureToReplace = [];
    for (let index = 0; index < count; index += 1) {
      def.textureToFind.push(stream.u16());
      def.textureToReplace.push(stream.u16());
    }
  } else {
    throw new Error(`unrecognized spotanim opcode ${opcode} at byte ${stream.offset - 1}`);
  }
}

function decodeItemOpcode(opcode, def, stream) {
  if (opcode === 1) def.inventoryModel = stream.u16();
  else if (opcode === 2) def.name = stream.string();
  else if (opcode === 3) def.examine = stream.string();
  else if (opcode === 4) def.zoom2d = stream.u16();
  else if (opcode === 5) def.xan2d = stream.u16();
  else if (opcode === 6) def.yan2d = stream.u16();
  else if (opcode === 7) def.xOffset2d = stream.signedU16();
  else if (opcode === 8) def.yOffset2d = stream.signedU16();
  else if (opcode === 9) def.unknown1 = stream.string();
  else if (opcode === 11) def.stackable = 1;
  else if (opcode === 12) def.cost = stream.i32();
  else if (opcode === 13) def.wearPos1 = stream.i8();
  else if (opcode === 14) def.wearPos2 = stream.i8();
  else if (opcode === 15) def.tradeable = false;
  else if (opcode === 16) def.members = true;
  else if (opcode === 23) {
    def.maleModel0 = stream.u16();
    def.maleOffset = stream.u8();
  } else if (opcode === 24) def.maleModel1 = stream.u16();
  else if (opcode === 25) {
    def.femaleModel0 = stream.u16();
    def.femaleOffset = stream.u8();
  } else if (opcode === 26) def.femaleModel1 = stream.u16();
  else if (opcode === 27) def.wearPos3 = stream.i8();
  else if (opcode >= 30 && opcode < 35) {
    const option = stream.string();
    def.options[opcode - 30] = option.toLowerCase() === "hidden" ? null : option;
  } else if (opcode >= 35 && opcode < 40) def.interfaceOptions[opcode - 35] = stream.string();
  else if (opcode === 40) {
    const count = stream.u8();
    def.colorFind = [];
    def.colorReplace = [];
    for (let index = 0; index < count; index += 1) {
      def.colorFind.push(stream.u16());
      def.colorReplace.push(stream.u16());
    }
  } else if (opcode === 41) {
    const count = stream.u8();
    def.textureFind = [];
    def.textureReplace = [];
    for (let index = 0; index < count; index += 1) {
      def.textureFind.push(stream.u16());
      def.textureReplace.push(stream.u16());
    }
  } else if (opcode === 42) def.shiftClickDropIndex = stream.i8();
  else if (opcode === 43) {
    stream.u8();
    while (stream.u8() !== 0) {
      stream.string();
    }
  } else if (opcode === 44) def.inventoryModel = stream.i32();
  else if (opcode === 45) {
    def.maleModel0 = stream.i32();
    def.maleOffset = stream.u8();
  } else if (opcode === 46) def.maleModel1 = stream.i32();
  else if (opcode === 47) def.maleModel2 = stream.i32();
  else if (opcode === 48) {
    def.femaleModel0 = stream.i32();
    def.femaleOffset = stream.u8();
  } else if (opcode === 49) def.femaleModel1 = stream.i32();
  else if (opcode === 50) def.femaleModel2 = stream.i32();
  else if (opcode === 51) def.maleHeadModel = stream.i32();
  else if (opcode === 52) def.maleHeadModel2 = stream.i32();
  else if (opcode === 53) def.femaleHeadModel = stream.i32();
  else if (opcode === 54) def.femaleHeadModel2 = stream.i32();
  else if (opcode === 65) def.geTradeable = true;
  else if (opcode === 75) def.weight = stream.i16();
  else if (opcode === 78) def.maleModel2 = stream.u16();
  else if (opcode === 79) def.femaleModel2 = stream.u16();
  else if (opcode === 90) def.maleHeadModel = stream.u16();
  else if (opcode === 91) def.femaleHeadModel = stream.u16();
  else if (opcode === 92) def.maleHeadModel2 = stream.u16();
  else if (opcode === 93) def.femaleHeadModel2 = stream.u16();
  else if (opcode === 94) def.category = stream.u16();
  else if (opcode === 95) def.zan2d = stream.u16();
  else if (opcode === 97) def.notedID = stream.u16();
  else if (opcode === 98) def.notedTemplate = stream.u16();
  else if (opcode >= 100 && opcode < 110) {
    def.countObj ??= Array(10).fill(0);
    def.countCo ??= Array(10).fill(0);
    def.countObj[opcode - 100] = stream.u16();
    def.countCo[opcode - 100] = stream.u16();
  } else if (opcode === 110) def.resizeX = stream.u16();
  else if (opcode === 111) def.resizeY = stream.u16();
  else if (opcode === 112) def.resizeZ = stream.u16();
  else if (opcode === 113) def.ambient = stream.i8();
  else if (opcode === 114) def.contrast = stream.i8();
  else if (opcode === 115) def.team = stream.u8();
  else if (opcode === 139) def.boughtId = stream.u16();
  else if (opcode === 140) def.boughtTemplateId = stream.u16();
  else if (opcode === 148) def.placeholderId = stream.u16();
  else if (opcode === 149) def.placeholderTemplateId = stream.u16();
  else if (opcode === 200) {
    stream.u8();
    stream.u8();
    stream.string();
  } else if (opcode === 201) {
    stream.u8();
    stream.u16();
    stream.u16();
    stream.i32();
    stream.i32();
    stream.string();
  } else if (opcode === 202) {
    stream.u8();
    stream.u16();
    stream.u16();
    stream.u16();
    stream.i32();
    stream.i32();
    stream.string();
  } else if (opcode === 249) {
    const count = stream.u8();
    def.params = {};
    for (let index = 0; index < count; index += 1) {
      const isString = stream.u8() === 1;
      const key = stream.u24();
      def.params[key] = isString ? stream.string() : stream.i32();
    }
  } else {
    throw new Error(`unrecognized item opcode ${opcode} at byte ${stream.offset - 1}`);
  }
}

async function importCurrentCacheSequences(cache, specs) {
  if (specs.length === 0) {
    return [];
  }

  const sequenceFiles = await cache.archiveFiles(2, 12);
  const frameMapCache = new Map();
  const imported = [];

  for (const spec of specs) {
    const sequenceBytes = sequenceFiles.get(spec.id);
    if (!sequenceBytes) {
      throw new Error(`current cache sequence archive 12 does not contain sequence ${spec.id}`);
    }

    const sequence = decodeSequenceDefinition(spec.id, sequenceBytes);
    const frameMapEntries = new Map();
    const frameEntries = new Map();
    for (const packedFrameId of sequence.frameIDs ?? []) {
      const archiveId = packedFrameId >>> 16;
      const fileId = packedFrameId & 0xffff;
      const frameBytes = await cache.archiveFile(0, archiveId, fileId);
      const frameMapId = frameBytes.readUInt16BE(0);
      let frameMap = frameMapCache.get(frameMapId);
      if (!frameMap) {
        const frameMapFiles = await cache.archiveFiles(1, frameMapId);
        const frameMapBytes = frameMapFiles.values().next().value;
        if (!frameMapBytes) {
          throw new Error(`missing framemap ${frameMapId} for sequence ${spec.id}`);
        }
        frameMap = decodeFramemapDefinition(frameMapId, frameMapBytes);
        frameMapCache.set(frameMapId, frameMap);
      }
      frameMapEntries.set(String(frameMapId), frameMap.fixture);
      const frame = decodeFrameDefinition(archiveId, fileId, frameBytes, frameMap);
      frameEntries.set(`${archiveId}:${fileId}`, frame);
    }

    imported.push({
      id: spec.id,
      name: spec.name,
      sequence,
      frameMaps: frameMapEntries,
      frames: frameEntries
    });
  }

  return imported;
}

async function mergeAnimationFixtures(importedSequences) {
  const sequencePath = path.join(projectRoot, "fixtures", "assets", "animations", "sequences.json");
  const frameStorePath = path.join(projectRoot, "fixtures", "assets", "animations", "frames.json");
  const sequences = JSON.parse(await readFile(sequencePath, "utf8"));
  const frameStore = JSON.parse(await readFile(frameStorePath, "utf8"));
  frameStore.frameMaps ??= {};
  frameStore.frames ??= {};

  for (const imported of importedSequences) {
    sequences[String(imported.id)] = imported.sequence;
    for (const [frameMapId, frameMap] of imported.frameMaps.entries()) {
      frameStore.frameMaps[frameMapId] = frameMap;
    }
    for (const [frameKey, frame] of imported.frames.entries()) {
      frameStore.frames[frameKey] = frame;
    }
  }

  await writeFile(sequencePath, `${JSON.stringify(sequences, null, 2)}\n`);
  await writeFile(frameStorePath, `${JSON.stringify(frameStore, null, 2)}\n`);
}

function decodeSequenceDefinition(id, data) {
  const stream = new ByteStream(data);
  const def = {
    id,
    frameIDs: [],
    frameLenghts: [],
    rightHandItem: -1,
    stretches: false,
    forcedPriority: 5,
    maxLoops: 99,
    precedenceAnimating: -1,
    leftHandItem: -1,
    replyMode: 2,
    frameStep: -1,
    priority: -1
  };

  while (true) {
    const opcode = stream.u8();
    if (opcode === 0) {
      return def;
    }
    decodeSequenceOpcode(opcode, def, stream);
  }
}

function decodeSequenceOpcode(opcode, def, stream) {
  if (opcode === 1) {
    const count = stream.u16();
    def.frameLenghts = Array.from({ length: count }, () => stream.u16());
    def.frameIDs = Array.from({ length: count }, () => stream.u16());
    for (let index = 0; index < count; index += 1) {
      def.frameIDs[index] += stream.u16() << 16;
    }
  } else if (opcode === 2) {
    def.frameStep = stream.u16();
  } else if (opcode === 3) {
    const count = stream.u8();
    def.interleaveLeave = Array.from({ length: count }, () => stream.u8());
    def.interleaveLeave.push(9999999);
  } else if (opcode === 4) {
    def.stretches = true;
  } else if (opcode === 5) {
    def.forcedPriority = stream.u8();
  } else if (opcode === 6) {
    def.leftHandItem = stream.u16();
  } else if (opcode === 7) {
    def.rightHandItem = stream.u16();
  } else if (opcode === 8) {
    def.maxLoops = stream.u8();
  } else if (opcode === 9) {
    def.precedenceAnimating = stream.u8();
  } else if (opcode === 10) {
    def.priority = stream.u8();
  } else if (opcode === 11) {
    def.replyMode = stream.u8();
  } else if (opcode === 12) {
    const count = stream.u8();
    def.chatFrameIds = Array.from({ length: count }, () => stream.u16());
    for (let index = 0; index < count; index += 1) {
      def.chatFrameIds[index] += stream.u16() << 16;
    }
  } else if (opcode === 13) {
    def.animMayaID = stream.i32();
  } else if (opcode === 14) {
    const count = stream.u16();
    def.frameSounds = {};
    for (let index = 0; index < count; index += 1) {
      const frame = stream.u16();
      def.frameSounds[frame] = readCurrentFrameSound(stream);
    }
  } else if (opcode === 15) {
    def.animMayaStart = stream.u16();
    def.animMayaEnd = stream.u16();
  } else if (opcode === 16) {
    def.verticalOffset = stream.i8();
  } else if (opcode === 17) {
    def.animMayaMasks = Array(256).fill(false);
    const count = stream.u8();
    for (let index = 0; index < count; index += 1) {
      def.animMayaMasks[stream.u8()] = true;
    }
  } else if (opcode === 18) {
    def.debugName = stream.string();
  } else if (opcode === 19) {
    def.soundsCrossWorldView = true;
  } else {
    throw new Error(`unrecognized sequence opcode ${opcode} at byte ${stream.offset - 1}`);
  }
}

function readCurrentFrameSound(stream) {
  return {
    id: stream.u16(),
    weight: stream.u8(),
    loops: stream.u8(),
    location: stream.u8(),
    retain: stream.u8()
  };
}

function decodeFramemapDefinition(id, data) {
  const stream = new ByteStream(data);
  const length = stream.u8();
  const types = Array.from({ length }, () => stream.u8());
  const frameMaps = Array.from({ length }, () => Array(stream.u8()).fill(0));
  for (let index = 0; index < length; index += 1) {
    for (let group = 0; group < frameMaps[index].length; group += 1) {
      frameMaps[index][group] = stream.u8();
    }
  }
  const fixture = {
    id,
    labels: types.map((type, label) => ({
      label,
      type,
      groups: frameMaps[label]
    }))
  };
  return { id, length, types, frameMaps, fixture };
}

function decodeFrameDefinition(archiveId, fileId, data, frameMap) {
  const indexStream = new ByteStream(data);
  const dataStream = new ByteStream(data);
  const frameMapId = indexStream.u16();
  const length = indexStream.u8();
  dataStream.offset = 3 + length;

  const labels = [];
  const xs = [];
  const ys = [];
  const zs = [];
  let lastLabel = -1;
  let showing = false;

  for (let label = 0; label < length; label += 1) {
    const mask = indexStream.u8();
    if (mask <= 0) {
      continue;
    }
    const type = frameMap.types[label] ?? 0;
    if (type !== 0) {
      for (let previous = label - 1; previous > lastLabel; previous -= 1) {
        if ((frameMap.types[previous] ?? 0) === 0) {
          labels.push(previous);
          xs.push(0);
          ys.push(0);
          zs.push(0);
          break;
        }
      }
    }

    labels.push(label);
    const defaultValue = type === 3 ? 128 : 0;
    xs.push((mask & 1) !== 0 ? dataStream.shortSmart() : defaultValue);
    ys.push((mask & 2) !== 0 ? dataStream.shortSmart() : defaultValue);
    zs.push((mask & 4) !== 0 ? dataStream.shortSmart() : defaultValue);
    lastLabel = label;
    if (type === 5) {
      showing = true;
    }
  }

  if (dataStream.offset !== data.length) {
    throw new Error(
      `frame decode length mismatch for ${archiveId}:${fileId}; read ${dataStream.offset}, expected ${data.length}`
    );
  }

  return {
    archiveId,
    fileId,
    packedFrameId: (archiveId << 16) + fileId,
    frameMapId,
    showing,
    transforms: labels.map((label, index) => ({
      label,
      type: frameMap.types[label] ?? 0,
      groups: frameMap.frameMaps[label] ?? [],
      x: xs[index],
      y: ys[index],
      z: zs[index]
    }))
  };
}

async function decodeModernModelDtos(rawModels) {
  const helperRoot = path.join(projectRoot, ".codex-logs", "current-cache-model-import");
  const rawDir = path.join(helperRoot, "raw-models");
  const javaRoot = path.join(helperRoot, "java");
  const modelDefinitionPath = path.join(javaRoot, "net", "runelite", "cache", "definitions", "ModelDefinition.java");
  const modelLoaderPath = path.join(javaRoot, "net", "runelite", "cache", "definitions", "loaders", "ModelLoader.java");
  const helperPath = path.join(javaRoot, "CurrentCacheModelDump.java");
  const outputPath = path.join(helperRoot, "model-dtos.json");

  await mkdir(path.dirname(modelDefinitionPath), { recursive: true });
  await mkdir(path.dirname(modelLoaderPath), { recursive: true });
  await mkdir(rawDir, { recursive: true });

  for (const [modelId, bytes] of rawModels.entries()) {
    await writeFile(path.join(rawDir, `${modelId}.dat`), bytes);
  }

  const [definitionSource, loaderSource] = await Promise.all([
    fetchSource("https://raw.githubusercontent.com/runelite/runelite/master/cache/src/main/java/net/runelite/cache/definitions/ModelDefinition.java"),
    fetchSource("https://raw.githubusercontent.com/runelite/runelite/master/cache/src/main/java/net/runelite/cache/definitions/loaders/ModelLoader.java")
  ]);
  await writeFile(modelDefinitionPath, stripLombokFromModelDefinition(definitionSource));
  await writeFile(modelLoaderPath, loaderSource);
  await writeFile(helperPath, currentCacheModelDumpJavaSource());

  const cacheClasses = path.resolve(
    projectRoot,
    "..",
    "kronos-osrs-184-master",
    "kronos-osrs-184-master",
    "Kronos-master",
    "runelite",
    "cache",
    "build",
    "classes",
    "java",
    "main"
  );
  if (!existsSync(cacheClasses)) {
    throw new Error(`missing compiled Kronos cache classes at ${cacheClasses}`);
  }

  execFileSync("javac", ["-cp", cacheClasses, "-d", helperRoot, modelDefinitionPath, modelLoaderPath, helperPath], {
    stdio: "pipe"
  });
  execFileSync(
    "java",
    ["-cp", `${helperRoot}${path.delimiter}${cacheClasses}`, "CurrentCacheModelDump", rawDir, outputPath, ...rawModels.keys()],
    { stdio: "pipe" }
  );

  return new Map(Object.entries(JSON.parse(await readFile(outputPath, "utf8"))).map(([key, value]) => [Number(key), value]));
}

async function fetchSource(url) {
  const response = await fetch(url, { headers: { "User-Agent": "Codex NH Trainer current-cache importer" } });
  if (!response.ok) {
    throw new Error(`failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function stripLombokFromModelDefinition(source) {
  let result = source.replace(/import lombok\.Data;\r?\n/, "").replace(/@Data\r?\n/, "");
  if (!result.includes("int[][] getVertexGroups()")) {
    result = result.replace(
      /\r?\n}\s*$/,
      "\n\n\tpublic int[][] getVertexGroups()\n\t{\n\t\treturn vertexGroups;\n\t}\n}\n"
    );
  }
  return result;
}

function currentCacheModelDumpJavaSource() {
  return String.raw`
import java.lang.reflect.Array;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import net.runelite.cache.definitions.ModelDefinition;
import net.runelite.cache.definitions.loaders.ModelLoader;

public class CurrentCacheModelDump {
  private static Map<String, Object> dto(ModelDefinition model) {
    model.computeTextureUVCoordinates();
    Map<String, Object> dto = new LinkedHashMap<>();
    dto.put("id", model.id);
    dto.put("vertexCount", model.vertexCount);
    dto.put("vertexPositionsX", model.vertexX);
    dto.put("vertexPositionsY", model.vertexY);
    dto.put("vertexPositionsZ", model.vertexZ);
    dto.put("vertexGroups", model.getVertexGroups());
    dto.put("faceCount", model.faceCount);
    dto.put("faceVertexIndices1", model.faceIndices1);
    dto.put("faceVertexIndices2", model.faceIndices2);
    dto.put("faceVertexIndices3", model.faceIndices3);
    dto.put("faceAlphas", model.faceTransparencies);
    dto.put("faceSkins", model.packedTransparencyVertexGroups);
    dto.put("faceColors", model.faceColors);
    dto.put("faceRenderPriorities", model.faceRenderPriorities);
    dto.put("faceRenderTypes", model.faceRenderTypes);
    dto.put("faceTextures", model.faceTextures);
    dto.put("textureCoordinates", model.textureCoords);
    dto.put("textureTriangleCount", model.numTextureFaces);
    dto.put("textureTriangleVertexIndices1", model.texIndices1);
    dto.put("textureTriangleVertexIndices2", model.texIndices2);
    dto.put("textureTriangleVertexIndices3", model.texIndices3);
    dto.put("texturePrimaryColors", model.texturePrimaryColors);
    dto.put("textureRenderTypes", model.textureRenderTypes);
    dto.put("faceTextureUCoordinates", model.faceTextureUCoordinates);
    dto.put("faceTextureVCoordinates", model.faceTextureVCoordinates);
    dto.put("priority", model.priority);
    return dto;
  }

  public static void main(String[] args) throws Exception {
    Path rawDir = Path.of(args[0]);
    Path outputPath = Path.of(args[1]);
    Map<String, Object> models = new LinkedHashMap<>();
    ModelLoader loader = new ModelLoader();
    for (int i = 2; i < args.length; i++) {
      int modelId = Integer.parseInt(args[i]);
      byte[] data = Files.readAllBytes(rawDir.resolve(modelId + ".dat"));
      models.put(Integer.toString(modelId), dto(loader.load(modelId, data)));
    }
    Files.writeString(outputPath, toJson(models));
  }

  private static String toJson(Object value) {
    StringBuilder out = new StringBuilder();
    appendJson(out, value);
    out.append('\n');
    return out.toString();
  }

  private static void appendJson(StringBuilder out, Object value) {
    if (value == null) {
      out.append("null");
      return;
    }
    if (value instanceof Number || value instanceof Boolean) {
      out.append(value.toString());
      return;
    }
    if (value instanceof String) {
      appendQuoted(out, (String) value);
      return;
    }
    if (value instanceof Map<?, ?> map) {
      out.append('{');
      boolean first = true;
      for (Map.Entry<?, ?> entry : map.entrySet()) {
        if (!first) out.append(',');
        first = false;
        appendQuoted(out, entry.getKey().toString());
        out.append(':');
        appendJson(out, entry.getValue());
      }
      out.append('}');
      return;
    }
    Class<?> type = value.getClass();
    if (type.isArray()) {
      out.append('[');
      int length = Array.getLength(value);
      for (int i = 0; i < length; i++) {
        if (i > 0) out.append(',');
        appendJson(out, Array.get(value, i));
      }
      out.append(']');
      return;
    }
    appendQuoted(out, value.toString());
  }

  private static void appendQuoted(StringBuilder out, String value) {
    out.append('"');
    for (int i = 0; i < value.length(); i++) {
      char c = value.charAt(i);
      if (c == '"' || c == '\\') out.append('\\').append(c);
      else if (c == '\n') out.append("\\n");
      else if (c == '\r') out.append("\\r");
      else if (c == '\t') out.append("\\t");
      else out.append(c);
    }
    out.append('"');
  }
}
`;
}

class ByteStream {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = 0;
  }

  u8() {
    return this.buffer[this.offset++];
  }

  i8() {
    const value = this.buffer.readInt8(this.offset);
    this.offset += 1;
    return value;
  }

  u16() {
    const value = this.buffer.readUInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  i16() {
    const value = this.buffer.readInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  signedU16() {
    const value = this.u16();
    return value > 32767 ? value - 65536 : value;
  }

  u24() {
    const value = readMedium(this.buffer, this.offset);
    this.offset += 3;
    return value;
  }

  i32() {
    const value = this.buffer.readInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  bigSmart() {
    if (this.buffer[this.offset] < 128) {
      return this.u16();
    }
    const value = this.buffer.readInt32BE(this.offset) & 0x7fffffff;
    this.offset += 4;
    return value;
  }

  shortSmart() {
    return this.buffer[this.offset] < 128 ? this.u8() - 64 : this.u16() - 0xc000;
  }

  string() {
    const start = this.offset;
    while (this.buffer[this.offset] !== 0) {
      this.offset += 1;
    }
    const value = this.buffer.subarray(start, this.offset).toString("latin1");
    this.offset += 1;
    return value;
  }
}

function readMedium(buffer, offset) {
  return (buffer[offset] << 16) | (buffer[offset + 1] << 8) | buffer[offset + 2];
}

await main();
