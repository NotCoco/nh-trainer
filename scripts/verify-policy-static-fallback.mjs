import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(projectRoot, "scripts", "policy-static-fallback-validation-electron.cjs");
const appSource = readFileSync(path.join(projectRoot, "src", "ui", "App.tsx"), "utf8");
const packageSource = readFileSync(path.join(projectRoot, "package.json"), "utf8");
const staticPolicyPath = path.join(projectRoot, "fixtures", "ai", "nhstaker-selfplay-policy-hard.tsv");
const tsvPolicyVariantPaths = [staticPolicyPath];
const hardNeuralPolicyPath = path.join(projectRoot, "fixtures", "ai", "nh-neural-policy-hard.json");
const hardNeuralChunkPaths = [
  "fixtures/ai/nh-neural-policy-hard.json.part-001",
  "fixtures/ai/nh-neural-policy-hard.json.part-002",
  "fixtures/ai/nh-neural-policy-hard.json.part-003"
].map((relativePath) => path.join(projectRoot, relativePath));
const dmmHardNeuralPolicyPath = path.join(projectRoot, "fixtures", "ai", "nh-neural-policy-dmm-candidate.json");
const dmmHardNeuralChunkPaths = [
  "fixtures/ai/nh-neural-policy-dmm-candidate.json.part-001",
  "fixtures/ai/nh-neural-policy-dmm-candidate.json.part-002"
].map((relativePath) => path.join(projectRoot, relativePath));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
    appSource.includes("BOT_DIFFICULTY_POLICIES") &&
    appSource.includes("readStaticDifficultyPolicy") &&
    appSource.includes("parseNhPolicyTsv") &&
    appSource.includes("parseNhNeuralPolicyJson"),
  "App should load selectable bot difficulty policies while using neural JSON for hard."
);
assert(
  appSource.includes('hard:') &&
    appSource.includes('staticUrl: "./ai/nh-neural-policy-hard.json"') &&
    appSource.includes('staticUrls: [') &&
    appSource.includes('"./ai/nh-neural-policy-hard.json.part-001"') &&
    appSource.includes('"./ai/nh-neural-policy-hard.json.part-003"') &&
    appSource.includes('format: "neural-json"'),
  "Hard difficulty should load the promoted chunked neural JSON, not the legacy hard TSV."
);
assert(
  appSource.includes("DMM_HARD_POLICY") &&
    appSource.includes('staticUrl: "./ai/nh-neural-policy-dmm-candidate.json"') &&
    appSource.includes('"./ai/nh-neural-policy-dmm-candidate.json.part-001"') &&
    appSource.includes('"./ai/nh-neural-policy-dmm-candidate.json.part-002"') &&
    appSource.includes("setLoadedDmmHardPolicy(parseDifficultyPolicy(result, DMM_HARD_POLICY))"),
  "DMM hard should load the promoted DMM neural JSON through deployable chunks."
);
assert(
  packageSource.includes('"sync:policy": "node scripts/sync-default-policy.mjs"') &&
    packageSource.includes('"predev": "node scripts/sync-default-policy.mjs --optional"') &&
    packageSource.includes('"prebuild": "node scripts/sync-default-policy.mjs --optional"'),
  "package scripts should keep the web-served policy synced before local dev and local builds."
);
const policySummaries = tsvPolicyVariantPaths.map((policyPath) => {
  const policy = readFileSync(policyPath, "utf8");
  const policyStat = statSync(policyPath);
  assert(policyStat.size > 100_000, `${policyPath} is too small to be a trained NH policy.`);
  assert(policy.includes("version\t"), `${policyPath} should include a version row.`);
  assert(policy.includes("counters\t"), `${policyPath} should include policy counters.`);
  assert(policy.includes("\now\t"), `${policyPath} should include learned weight rows.`);
  return {
    policyPath,
    bytes: policyStat.size
  };
});
policySummaries.push(validateChunkedNeuralPolicy(hardNeuralPolicyPath, hardNeuralChunkPaths, 44_550));
policySummaries.push(validateChunkedNeuralPolicy(dmmHardNeuralPolicyPath, dmmHardNeuralChunkPaths, 21_906));

const child = spawn(electronPath, [validatorPath, projectRoot], {
  cwd: projectRoot,
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

const exitCode = await new Promise((resolve) => {
  child.on("close", resolve);
});

if (exitCode !== 0) {
  throw new Error(`static policy fallback runtime validation failed with code ${exitCode}\n${stderr}\n${stdout}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      policies: policySummaries,
      runtime: JSON.parse(stdout)
    },
    null,
    2
  )
);

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function validateChunkedNeuralPolicy(policyPath, chunkPaths, expectedActionCount) {
  const fullText = readFileSync(policyPath, "utf8");
  const chunkTexts = chunkPaths.map((chunkPath) => readFileSync(chunkPath, "utf8"));
  const joinedText = chunkTexts.join("");
  assert(sha256(joinedText) === sha256(fullText), `${policyPath} chunks should reassemble to the full neural policy.`);
  const summary = validateNeuralPolicyText(policyPath, joinedText, expectedActionCount);
  return {
    ...summary,
    chunks: chunkPaths.map((chunkPath, index) => ({
      path: chunkPath,
      bytes: statSync(chunkPath).size,
      index: index + 1
    }))
  };
}

function validateNeuralPolicy(policyPath, expectedActionCount) {
  return validateNeuralPolicyText(policyPath, readFileSync(policyPath, "utf8"), expectedActionCount);
}

function validateNeuralPolicyText(policyPath, text, expectedActionCount) {
  const policy = JSON.parse(text);
  const policyStat = statSync(policyPath);
  const actionCount = policy.schema?.actionCount;
  const actionIds = policy.schema?.actionIds;
  assert(policy.kind === "nh-neural-policy", `${policyPath} should be an NH neural policy.`);
  assert(policyStat.size > 1_000_000, `${policyPath} is too small to be a trained NH neural policy.`);
  assert(actionCount === expectedActionCount, `${policyPath} should expose ${expectedActionCount} neural action outputs.`);
  assert(policy.schema?.inputSize >= 90, `${policyPath} should include the neural input schema.`);
  assert(policy.schema?.featureSize >= 139, `${policyPath} should include the encoded feature schema.`);
  if (actionIds !== undefined) {
    assert(Array.isArray(actionIds), `${policyPath} actionIds should be an array when present.`);
    assert(actionIds.length === actionCount, `${policyPath} actionIds should match actionCount.`);
  }
  assert(Array.isArray(policy.model?.layers) && policy.model.layers.length > 0, `${policyPath} should include hidden layers.`);
  assert(Array.isArray(policy.model?.policy?.weight), `${policyPath} should include neural policy weights.`);
  assert(Array.isArray(policy.model?.policy?.bias), `${policyPath} should include neural policy bias.`);
  assert(policy.model.policy.weight.length === actionCount, `${policyPath} policy weight rows should match actionCount.`);
  assert(policy.model.policy.bias.length === actionCount, `${policyPath} policy bias should match actionCount.`);
  return {
    policyPath,
    bytes: policyStat.size,
    format: "neural-json",
    inputSize: policy.schema.inputSize,
    featureSize: policy.schema.featureSize,
    actionCount
  };
}
