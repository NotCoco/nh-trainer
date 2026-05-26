import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kronosRoot = path.resolve(projectRoot, "..");
const sourcePolicyPath = path.join(
  kronosRoot,
  "kronos-osrs-184-master",
  "kronos-osrs-184-master",
  "Kronos-master",
  "kronos-server",
  "data",
  "ai",
  "nhstaker-selfplay-policy-nhstake-ags.tsv"
);
const targetPolicyPath = path.join(projectRoot, "fixtures", "ai", "nhstaker-selfplay-policy-nhstake-ags.tsv");
const policyVariants = [
  {
    source: path.join(path.dirname(sourcePolicyPath), "nhstaker-selfplay-policy-nhstake-ags-easy.tsv"),
    target: path.join(projectRoot, "fixtures", "ai", "nhstaker-selfplay-policy-easy.tsv"),
    optional: true
  },
  {
    source: path.join(path.dirname(sourcePolicyPath), "nhstaker-selfplay-policy-nhstake-ags-medium.tsv"),
    target: path.join(projectRoot, "fixtures", "ai", "nhstaker-selfplay-policy-medium.tsv"),
    optional: true
  },
  {
    source: path.join(path.dirname(sourcePolicyPath), "nhstaker-selfplay-policy-nhstake-ags-hard.tsv"),
    target: path.join(projectRoot, "fixtures", "ai", "nhstaker-selfplay-policy-hard.tsv"),
    optional: true
  }
];
const optional = process.argv.includes("--optional");

async function main() {
  try {
    const sourceStat = await stat(sourcePolicyPath);
    if (!sourceStat.isFile()) {
      throw new Error(`not a file: ${sourcePolicyPath}`);
    }
    await mkdir(path.dirname(targetPolicyPath), { recursive: true });
    await copyFile(sourcePolicyPath, targetPolicyPath);
    const variants = [];
    for (const variant of policyVariants) {
      try {
        const variantStat = await stat(variant.source);
        if (!variantStat.isFile()) {
          throw new Error(`not a file: ${variant.source}`);
        }
        await copyFile(variant.source, variant.target);
        variants.push({
          sourcePolicyPath: variant.source,
          targetPolicyPath: variant.target,
          bytes: (await stat(variant.target)).size,
          sourceLastWriteMs: variantStat.mtimeMs
        });
      } catch (error) {
        if (!variant.optional) {
          throw error;
        }
      }
    }
    const targetStat = await stat(targetPolicyPath);
    console.log(
      JSON.stringify(
        {
          ok: true,
          sourcePolicyPath,
          targetPolicyPath,
          bytes: targetStat.size,
          sourceLastWriteMs: sourceStat.mtimeMs,
          variants
        },
        null,
        2
      )
    );
  } catch (error) {
    if (optional) {
      console.warn(
        `Skipping optional default policy sync: ${error instanceof Error ? error.message : String(error)}`
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
