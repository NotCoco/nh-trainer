import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readText(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

function collectStringArrayBlocks(sourceText, key) {
  const blocks = [];
  const pattern = new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\]`, "g");
  let match;
  while ((match = pattern.exec(sourceText)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

function collectFixturePaths(sourceText) {
  const paths = new Set();
  for (const block of collectStringArrayBlocks(sourceText, "requiredArtifacts")) {
    for (const match of block.matchAll(/"([^"]+)"/g)) {
      paths.add(match[1]);
    }
  }
  return [...paths].sort();
}

async function exists(relativePath) {
  try {
    await access(path.join(projectRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

const sourceFiles = [
  "src/assets/index.ts",
  "src/render/index.ts",
  "src/render/workbench.ts"
];
const fixturePaths = new Set();

for (const sourceFile of sourceFiles) {
  for (const fixturePath of collectFixturePaths(await readText(sourceFile))) {
    fixturePaths.add(fixturePath);
  }
}

const rows = [];
for (const fixturePath of [...fixturePaths].sort()) {
  rows.push({
    path: fixturePath,
    status: await exists(fixturePath) ? "present" : "missing"
  });
}

const presentCount = rows.filter((row) => row.status === "present").length;
const missingCount = rows.length - presentCount;

console.log(`render fixture readiness: ${presentCount}/${rows.length} present, ${missingCount} missing`);
for (const row of rows) {
  console.log(`${row.status.padEnd(7)} ${row.path}`);
}
