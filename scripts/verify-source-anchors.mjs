import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kronosRoot = path.resolve(projectRoot, "..");
const anchorsPath = path.join(projectRoot, "src", "evidence", "sourceAnchors.json");

const anchors = JSON.parse(await readFile(anchorsPath, "utf8"));
const failures = [];

for (const anchor of anchors) {
  const sourcePath = path.join(kronosRoot, ...anchor.sourcePath.split("/"));
  let sourceText = "";
  try {
    sourceText = await readFile(sourcePath, "utf8");
  } catch (error) {
    failures.push(`${anchor.id}: missing source file ${sourcePath}`);
    continue;
  }

  for (const snippet of anchor.requiredSnippets) {
    if (!sourceText.includes(snippet)) {
      failures.push(`${anchor.id}: missing snippet ${JSON.stringify(snippet)} in ${sourcePath}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`source anchor verification failed (${failures.length} issue${failures.length === 1 ? "" : "s"})`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`verified ${anchors.length} source anchors against Kronos server/client files`);
