import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientSource = path.resolve(
  projectRoot,
  "..",
  "nh-osrs-184-master",
  "nh-osrs-184-master",
  "Nh-master",
  "runelite",
  "runescape-client",
  "src",
  "main",
  "java",
  "class215.java"
);
const outputPath = path.join(projectRoot, "fixtures", "assets", "defs", "body-colors.json");

function parseShortArray(source, fieldName) {
  const match = source.match(new RegExp(`${fieldName}\\s*=\\s*new short\\[]\\{([\\s\\S]*?)\\};`));
  if (!match) {
    throw new Error(`could not find ${fieldName}`);
  }

  return match[1]
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
}

function parseShortMatrix(source, fieldName) {
  const match = source.match(new RegExp(`${fieldName}\\s*=\\s*new short\\[]\\[]\\{([\\s\\S]*?)\\};`));
  if (!match) {
    throw new Error(`could not find ${fieldName}`);
  }

  const body = match[1].replaceAll("new short[0]", "{}");
  return [...body.matchAll(/\{([^{}]*)\}/g)].map((row) =>
    row[1]
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
  );
}

const source = await readFile(clientSource, "utf8");
const bodyColors = {
  source: path.relative(projectRoot, clientSource).replaceAll("\\", "/"),
  primaryRecolorFrom: parseShortArray(source, "field2531"),
  primaryPalettes: parseShortMatrix(source, "field2530"),
  secondaryRecolorFrom: parseShortArray(source, "field2532"),
  secondaryPalettes: parseShortMatrix(source, "field2529")
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(bodyColors, null, 2)}\n`);
console.log(`exported body color definitions to ${path.relative(projectRoot, outputPath)}`);
