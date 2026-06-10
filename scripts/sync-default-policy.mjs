import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nhRoot = path.resolve(projectRoot, "..");
const sourcePolicyPath = path.join(
  nhRoot,
  "kronos-osrs-184-master",
  "kronos-osrs-184-master",
  "Kronos-master",
  "kronos-server",
  "data",
  "ai",
  "nhstaker-selfplay-policy-nhstake-ags-hard.tsv"
);
const targetPolicyPath = path.join(projectRoot, "fixtures", "ai", "nhstaker-selfplay-policy-hard.tsv");
const optional = process.argv.includes("--optional");

function targetRelativePath(filePath) {
  return path.relative(projectRoot, filePath).replace(/\\/g, "/");
}

async function main() {
  try {
    const sourceStat = await stat(sourcePolicyPath);
    if (!sourceStat.isFile()) {
      throw new Error(`not a file: ${sourcePolicyPath}`);
    }
    await mkdir(path.dirname(targetPolicyPath), { recursive: true });
    await copyFile(sourcePolicyPath, targetPolicyPath);
    const targetStat = await stat(targetPolicyPath);
    console.log(
      JSON.stringify(
        {
          ok: true,
          sourcePolicy: "local-training-output",
          targetPolicyPath: targetRelativePath(targetPolicyPath),
          bytes: targetStat.size,
          sourceLastWriteMs: sourceStat.mtimeMs
        },
        null,
        2
      )
    );
  } catch (error) {
    if (optional) {
      console.warn(
        `Skipping optional default policy sync: ${error instanceof Error ? error.message.replaceAll(nhRoot, "<workspace>") : String(error)}`
      );
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
