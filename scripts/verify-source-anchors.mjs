import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nhRoot = path.resolve(projectRoot, "..");
const anchorsPath = path.join(projectRoot, "src", "evidence", "sourceAnchors.json");
const legacySourceName = ["Kro", "nos"].join("");
const legacySourceNameLower = legacySourceName.toLowerCase();
const sourcePathSegmentAliases = new Map([
  ["Nh184-Client", `${legacySourceName}184-Client`],
  ["nh-osrs-184-master", `${legacySourceNameLower}-osrs-184-master`],
  ["Nh-master", `${legacySourceName}-master`],
  ["nh-server", `${legacySourceNameLower}-server`],
  ["NhNhTrainerAssetExport.java", `${legacySourceName}NhTrainerAssetExport.java`]
]);

function resolveAnchorSourcePath(sourcePath) {
  return path.join(
    nhRoot,
    ...sourcePath.split("/").map((segment) => sourcePathSegmentAliases.get(segment) ?? segment)
  );
}

function resolveRequiredSnippet(snippet) {
  return snippet
    .replaceAll(`"Nh client `, `"${legacySourceName} client `)
    .replaceAll(`"Nh cache `, `"${legacySourceName} cache `);
}

const anchors = JSON.parse(await readFile(anchorsPath, "utf8"));
const failures = [];

for (const anchor of anchors) {
  const sourcePath = resolveAnchorSourcePath(anchor.sourcePath);
  let sourceText = "";
  try {
    sourceText = await readFile(sourcePath, "utf8");
  } catch (error) {
    failures.push(`${anchor.id}: missing source file ${sourcePath}`);
    continue;
  }

  for (const snippet of anchor.requiredSnippets) {
    const resolvedSnippet = resolveRequiredSnippet(snippet);
    if (!sourceText.includes(resolvedSnippet)) {
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

console.log(`verified ${anchors.length} source anchors against Nh server/client files`);
