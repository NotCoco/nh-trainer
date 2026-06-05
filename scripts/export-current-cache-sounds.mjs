import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultCacheRoot = path.join(os.homedir(), ".runelite", "jagexcache", "oldschool", "LIVE");
const defaultOutDir = path.join(projectRoot, "fixtures", "render", "sounds");
const runeliteRoot = path.resolve(
  projectRoot,
  "..",
  "kronos-osrs-184-master",
  "kronos-osrs-184-master",
  "Kronos-master",
  "runelite"
);
const cacheSourceRoot = path.join(runeliteRoot, "cache", "src", "main", "java");
const helperSource = path.join(projectRoot, "scripts", "java", "SoundEffectWavExporter.java");
const helperRoot = path.join(projectRoot, ".codex-logs", "current-cache-sounds");
const rawDir = path.join(helperRoot, "raw");
const helperClassDir = path.join(helperRoot, "classes");
const soundDecoderSourceDir = path.join(helperRoot, "cache-sound-src");
const soundDecoderClassDir = path.join(helperRoot, "cache-sound-classes");

const defaultSoundIds = [
  102, 104, 106, 168, 169, 171, 227,
  1982, 2266, 2662, 2663, 2664, 2665, 2666, 2667, 2668, 2669, 2670, 2675, 2676, 2677, 2678,
  2679, 2680, 2682, 2684, 2685, 2686, 2687, 2688, 2689, 2690, 2691,
  2238, 2242, 2244, 2246, 2393, 2401, 2500, 2555, 2563, 2693, 2695, 2714, 2715, 2720,
  2907, 2910, 2917, 3825, 3826, 3846, 3869, 5027, 6182
];

const cacheRoot = path.resolve(valueAfter("--cache") ?? process.env.RUNELITE_CACHE_ROOT ?? defaultCacheRoot);
const outDir = path.resolve(valueAfter("--out") ?? defaultOutDir);
const soundIds = uniqueNumbers(
  valuesAfter("--sound").length > 0 ? valuesAfter("--sound").flatMap((value) => value.split(",")) : defaultSoundIds
);

if (soundIds.length === 0) {
  throw new Error("no sound ids requested");
}

async function main() {
  if (!existsSync(path.join(cacheRoot, "main_file_cache.dat2"))) {
    throw new Error(`missing live cache dat2 at ${cacheRoot}`);
  }

  await rm(rawDir, { recursive: true, force: true });
  await rm(helperClassDir, { recursive: true, force: true });
  await rm(soundDecoderSourceDir, { recursive: true, force: true });
  await rm(soundDecoderClassDir, { recursive: true, force: true });
  await mkdir(rawDir, { recursive: true });
  await mkdir(helperClassDir, { recursive: true });
  await mkdir(soundDecoderSourceDir, { recursive: true });
  await mkdir(soundDecoderClassDir, { recursive: true });
  await mkdir(outDir, { recursive: true });

  const cache = new CurrentCacheReader(cacheRoot);
  try {
    for (const soundId of soundIds) {
      await writeFile(path.join(rawDir, `${soundId}.dat`), await cache.decompressedArchive(4, soundId));
    }
  } finally {
    await cache.close();
  }

  const soundDecoderSources = await prepareSoundDecoderSources();
  run("javac", ["-d", soundDecoderClassDir, ...soundDecoderSources]);
  run("javac", ["-cp", soundDecoderClassDir, "-d", helperClassDir, helperSource]);
  run("java", [
    "-cp",
    [helperClassDir, soundDecoderClassDir].join(path.delimiter),
    "SoundEffectWavExporter",
    rawDir,
    outDir,
    soundIds.join(",")
  ]);

  const manifest = {
    source: "local:runelite-live-cache:index-4-sound-effects",
    sampleRate: 22050,
    channels: 1,
    format: "wav-pcm16",
    soundEffects: Object.fromEntries(soundIds.map((soundId) => [String(soundId), `render/sounds/sound-${soundId}.wav`]))
  };
  await writeFile(path.join(outDir, "sound-effects.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`exported ${soundIds.length} sound effects to ${path.relative(projectRoot, outDir)}`);
}

function valueAfter(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function valuesAfter(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1] !== undefined) {
      values.push(process.argv[index + 1]);
      index += 1;
    }
  }
  return values;
}

function uniqueNumbers(values) {
  return [...new Set(values.map((value) => Number.parseInt(String(value).trim(), 10)))]
    .filter((value) => Number.isInteger(value) && value >= 0)
    .sort((left, right) => left - right);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

async function prepareSoundDecoderSources() {
  const relativeSources = [
    path.join("net", "runelite", "cache", "io", "InputStream.java"),
    path.join("net", "runelite", "cache", "definitions", "sound", "AudioEnvelopeDefinition.java"),
    path.join("net", "runelite", "cache", "definitions", "sound", "SoundEffectDefinition.java"),
    path.join("net", "runelite", "cache", "definitions", "sound", "InstrumentDefinition.java"),
    path.join("net", "runelite", "cache", "definitions", "sound", "SoundEffectTrackDefinition.java"),
    path.join("net", "runelite", "cache", "definitions", "loaders", "sound", "AudioEnvelopeLoader.java"),
    path.join("net", "runelite", "cache", "definitions", "loaders", "sound", "SoundEffectLoader.java"),
    path.join("net", "runelite", "cache", "definitions", "loaders", "sound", "InstrumentLoader.java"),
    path.join("net", "runelite", "cache", "definitions", "loaders", "sound", "SoundEffectTrackLoader.java")
  ];
  const preparedSources = [];
  for (const relativeSource of relativeSources) {
    const sourcePath = path.join(cacheSourceRoot, relativeSource);
    const targetPath = path.join(soundDecoderSourceDir, relativeSource);
    await mkdir(path.dirname(targetPath), { recursive: true });
    const source = await readFile(sourcePath, "utf8");
    const patchedSource = relativeSource.endsWith(path.join("sound", "InstrumentDefinition.java"))
      ? patchInstrumentDefinitionClearLoop(source)
      : source;
    await writeFile(targetPath, patchedSource);
    preparedSources.push(targetPath);
  }
  return preparedSources;
}

function patchInstrumentDefinitionClearLoop(source) {
  if (source.includes("while (var2 < var3)")) {
    return source;
  }

  const patched = source.replace(
    /\t\twhile \(var2 < \(var3 \+= 7\)\)\r?\n\t\t\{\r?\n\t\t\tvar1\[var2\+\+\] = 0;\r?\n\t\t\}/,
    "\t\tvar3 += 7;\n\n\t\twhile (var2 < var3)\n\t\t{\n\t\t\tvar1[var2++] = 0;\n\t\t}"
  );
  if (patched === source) {
    throw new Error("unable to patch InstrumentDefinition clear loop for sound export");
  }
  return patched;
}

class CurrentCacheReader {
  constructor(root) {
    this.root = root;
    this.dat = null;
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

  async decompressedArchive(indexId, archiveId) {
    return decompressContainer(await this.archive(indexId, archiveId));
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

function readMedium(buffer, offset) {
  return (buffer[offset] << 16) | (buffer[offset + 1] << 8) | buffer[offset + 2];
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
