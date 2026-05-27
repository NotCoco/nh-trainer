import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.resolve(projectRoot, "dist");
const brandSource = ["kro", "nos"].join("");
const brandTarget = "source";
const textExtensions = new Set([
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".svg",
  ".txt",
  ".webmanifest",
  ".xml"
]);

function assertDistRoot() {
  if (!fs.existsSync(distRoot) || !fs.statSync(distRoot).isDirectory()) {
    throw new Error(`public build folder does not exist: ${distRoot}`);
  }
}

function brandVariants() {
  const variants = [];
  const total = 1 << brandSource.length;

  for (let mask = 0; mask < total; mask += 1) {
    let needle = "";
    let replacement = "";

    for (let index = 0; index < brandSource.length; index += 1) {
      const uppercase = (mask & (1 << index)) !== 0;
      needle += uppercase ? brandSource[index].toUpperCase() : brandSource[index];
      replacement += uppercase ? brandTarget[index].toUpperCase() : brandTarget[index];
    }

    variants.push({
      needle: Buffer.from(needle, "utf8"),
      replacement: Buffer.from(replacement, "utf8")
    });
  }

  return variants;
}

function replaceBuffer(buffer, needle, replacement) {
  if (needle.length !== replacement.length) {
    throw new Error(`replacement must preserve byte length: ${needle} -> ${replacement}`);
  }

  let offset = 0;
  let changed = false;
  let index = buffer.indexOf(needle, offset);

  while (index !== -1) {
    replacement.copy(buffer, index);
    changed = true;
    offset = index + replacement.length;
    index = buffer.indexOf(needle, offset);
  }

  return changed;
}

function isTextLike(filePath) {
  return textExtensions.has(path.extname(filePath).toLowerCase());
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  const dirs = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const child = walk(fullPath);
      files.push(...child.files);
      dirs.push(fullPath, ...child.dirs);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return { files, dirs };
}

function scrubFile(filePath, variants) {
  let buffer = fs.readFileSync(filePath);
  let changed = false;

  for (const { needle, replacement } of variants) {
    changed = replaceBuffer(buffer, needle, replacement) || changed;
  }

  if (isTextLike(filePath)) {
    const before = buffer.toString("utf8");
    const after = before
      .replaceAll("data-source-", "data-ref-")
      .replaceAll("data-menu-source", "data-menu-ref")
      .replaceAll("data-runelite-overlay-source", "data-runelite-overlay-ref");

    if (after !== before) {
      buffer = Buffer.from(after, "utf8");
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, buffer);
  }

  return changed;
}

function scrubName(name, variants) {
  let next = name;

  for (const { needle, replacement } of variants) {
    next = next.split(needle.toString("utf8")).join(replacement.toString("utf8"));
  }

  return next;
}

function renamePath(currentPath, variants) {
  const dir = path.dirname(currentPath);
  const currentName = path.basename(currentPath);
  const nextName = scrubName(currentName, variants);

  if (nextName === currentName) {
    return null;
  }

  const nextPath = path.join(dir, nextName);

  if (fs.existsSync(nextPath)) {
    throw new Error(`cannot scrub path because target already exists: ${nextPath}`);
  }

  fs.renameSync(currentPath, nextPath);
  return nextPath;
}

assertDistRoot();

const variants = brandVariants();
const { files, dirs } = walk(distRoot);
let changedFiles = 0;
let renamedPaths = 0;

for (const filePath of files) {
  if (scrubFile(filePath, variants)) {
    changedFiles += 1;
  }
}

for (const filePath of files) {
  if (renamePath(filePath, variants)) {
    renamedPaths += 1;
  }
}

for (const dirPath of dirs.sort((a, b) => b.length - a.length)) {
  if (renamePath(dirPath, variants)) {
    renamedPaths += 1;
  }
}

console.log(
  JSON.stringify(
    {
      distRoot,
      changedFiles,
      renamedPaths,
      publicDebugAttrs: "data-source-* -> data-ref-*"
    },
    null,
    2
  )
);
