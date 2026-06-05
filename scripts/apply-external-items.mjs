import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const externalItemsDir = path.join(projectRoot, "fixtures", "external-items");

const arrayTargets = [
  { path: "fixtures/assets/defs/server-items.json", field: "serverItem" },
  { path: "src/generated/server-items.json", field: "serverItem" },
  { path: "fixtures/assets/defs/equipment-bonuses.json", field: "equipmentRow" },
  { path: "src/generated/equipment-bonuses.json", field: "equipmentRow" }
];

const objectTargets = [
  { path: "fixtures/assets/defs/cache-items.json", field: "cacheItem" },
  { path: "fixtures/assets/models/cache-models.json", field: "cacheModels" },
  { path: "fixtures/assets/defs/weapon-types.json", field: "weaponTypes" },
  { path: "src/generated/weapon-types.json", field: "weaponTypes" }
];

const externalItems = await readExternalItems();

for (const target of arrayTargets) {
  await mergeArrayById(target.path, externalItems.map((item) => item[target.field]).filter(Boolean));
}

for (const target of objectTargets) {
  await mergeObjectByKey(target.path, externalItems.map((item) => item[target.field]).filter(Boolean));
}

await mergeItemSprites(externalItems);

console.log(`applied ${externalItems.length} external trainer item${externalItems.length === 1 ? "" : "s"}`);

async function readExternalItems() {
  const files = (await readdir(externalItemsDir))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const items = [];
  for (const file of files) {
    const parsed = JSON.parse(await readFile(path.join(externalItemsDir, file), "utf8"));
    const fileItems = Array.isArray(parsed.items) ? parsed.items : [parsed];
    for (const item of fileItems) {
      if (!Number.isInteger(item.id) || typeof item.name !== "string") {
        throw new Error(`invalid external item fixture ${file}`);
      }
      items.push(item);
    }
  }
  return items;
}

async function mergeArrayById(relativePath, rows) {
  if (rows.length === 0) {
    return;
  }
  const absolutePath = path.join(projectRoot, relativePath);
  const existing = JSON.parse(await readFile(absolutePath, "utf8"));
  if (!Array.isArray(existing)) {
    throw new Error(`${relativePath} is not an array`);
  }
  const byId = new Map(existing.map((row) => [row.id, row]));
  for (const row of rows) {
    if (!Number.isInteger(row.id)) {
      throw new Error(`missing numeric id for ${relativePath}`);
    }
    byId.set(row.id, row);
  }
  await writeJson(absolutePath, [...byId.values()].sort((left, right) => left.id - right.id));
}

async function mergeObjectByKey(relativePath, objects) {
  if (objects.length === 0) {
    return;
  }
  const absolutePath = path.join(projectRoot, relativePath);
  const raw = await readFile(absolutePath, "utf8");
  const existing = JSON.parse(raw);
  if (!existing || Array.isArray(existing) || typeof existing !== "object") {
    throw new Error(`${relativePath} is not an object`);
  }
  const entries = [];
  for (const object of objects) {
    if (isCacheItem(object)) {
      entries.push([String(object.id), object]);
    } else {
      entries.push(...Object.entries(object));
    }
  }

  if (entries.every(([key]) => !Object.prototype.hasOwnProperty.call(existing, key))) {
    await appendObjectEntriesPreservingJson(absolutePath, raw, existing, entries);
    return;
  }

  const merged = { ...existing };
  for (const [key, value] of entries) {
    merged[key] = value;
  }
  await writeJson(absolutePath, merged);
}

function isCacheItem(value) {
  return value && typeof value === "object" && Number.isInteger(value.id) && typeof value.name === "string";
}

async function mergeItemSprites(items) {
  const atlasPath = path.join(projectRoot, "fixtures", "render", "sprites", "item_sprites.png");
  const metadataPath = path.join(projectRoot, "fixtures", "render", "sprites", "item_sprites.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  let appended = false;

  for (const item of items) {
    if (!item.iconPath || metadata.sprites.some((sprite) => (sprite.itemId ?? sprite.spriteId) === item.id)) {
      continue;
    }
    const iconPath = path.join(projectRoot, ...item.iconPath.split(/[\\/]/));
    const x = metadata.width;
    appendIconFrames(atlasPath, iconPath);
    metadata.width += 72;
    metadata.sprites.push(itemSpriteEntry(item, "normal", x, 0, false));
    metadata.sprites.push(itemSpriteEntry(item, "selected", x + 36, 1, true));
    appended = true;
  }

  if (appended) {
    await writeJson(metadataPath, metadata);
  }
}

function appendIconFrames(atlasPath, iconPath) {
  const script = [
    "param($atlasPath, $iconPath)",
    "Add-Type -AssemblyName System.Drawing",
    "$tempPath = \"$atlasPath.tmp\"",
    "$atlas = [System.Drawing.Image]::FromFile($atlasPath)",
    "$icon = [System.Drawing.Image]::FromFile($iconPath)",
    "$bitmap = [System.Drawing.Bitmap]::new([int]($atlas.Width + 72), [int]([Math]::Max($atlas.Height, 32)), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)",
    "$graphics = [System.Drawing.Graphics]::FromImage($bitmap)",
    "$graphics.Clear([System.Drawing.Color]::Transparent)",
    "$graphics.DrawImage($atlas, 0, 0, $atlas.Width, $atlas.Height)",
    "$graphics.DrawImage($icon, $atlas.Width, 0, 36, 32)",
    "$graphics.DrawImage($icon, ($atlas.Width + 36), 0, 36, 32)",
    "$graphics.Dispose()",
    "$atlas.Dispose()",
    "$icon.Dispose()",
    "$bitmap.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)",
    "$bitmap.Dispose()",
    "Move-Item -LiteralPath $tempPath -Destination $atlasPath -Force"
  ].join("; ");
  execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `& { ${script} }`, atlasPath, iconPath], {
    stdio: "pipe"
  });
}

function itemSpriteEntry(item, variant, x, frame, selected) {
  return {
    spriteId: item.id,
    itemId: item.id,
    name: item.name,
    variant,
    selected,
    sourceBorder: selected ? 2 : 1,
    sourceShadowColor: selected ? 0 : 3153952,
    sourceQuantity: 1,
    quantityVariant: false,
    frame,
    x,
    y: 0,
    width: 36,
    height: 32,
    offsetX: 0,
    offsetY: 0,
    maxWidth: 36,
    maxHeight: 32,
    source: "external:runelite-static-cache-icon"
  };
}

async function appendObjectEntriesPreservingJson(absolutePath, raw, existing, entries) {
  const closingBraceIndex = raw.lastIndexOf("}");
  if (closingBraceIndex === -1) {
    throw new Error(`${absolutePath} is not a JSON object`);
  }
  const beforeClosingBrace = raw.slice(0, closingBraceIndex).replace(/\s*$/, "");
  const afterClosingBrace = raw.slice(closingBraceIndex);
  const separator = Object.keys(existing).length === 0 ? "" : ",";
  const entryJson = entries.map(([key, value]) => objectEntryJson(key, value)).join(",\n");
  await writeFile(absolutePath, `${beforeClosingBrace}${separator}\n${entryJson}\n${afterClosingBrace}`);
}

function objectEntryJson(key, value) {
  const valueLines = JSON.stringify(value, null, 2).split("\n");
  return `  ${JSON.stringify(key)}: ${valueLines.map((line, index) => (index === 0 ? line : `  ${line}`)).join("\n")}`;
}

async function writeJson(absolutePath, value) {
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}
