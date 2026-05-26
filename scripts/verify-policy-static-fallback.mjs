import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(projectRoot, "scripts", "policy-static-fallback-validation-electron.cjs");
const appSource = readFileSync(path.join(projectRoot, "src", "ui", "App.tsx"), "utf8");
const packageSource = readFileSync(path.join(projectRoot, "package.json"), "utf8");
const staticPolicyPath = path.join(projectRoot, "fixtures", "ai", "nhstaker-selfplay-policy-nhstake-ags.tsv");
const policyVariantPaths = [
  staticPolicyPath,
  path.join(projectRoot, "fixtures", "ai", "nhstaker-selfplay-policy-easy.tsv"),
  path.join(projectRoot, "fixtures", "ai", "nhstaker-selfplay-policy-medium.tsv"),
  path.join(projectRoot, "fixtures", "ai", "nhstaker-selfplay-policy-hard.tsv")
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  appSource.includes('const DEFAULT_STATIC_POLICY_URL = "./ai/nhstaker-selfplay-policy-nhstake-ags.tsv"'),
  "App should keep the browser-served default NH policy URL internal to the client shell."
);
assert(
  appSource.includes("bridge?.readDefaultPolicy") &&
    appSource.includes("BOT_DIFFICULTY_POLICIES") &&
    appSource.includes("readStaticDifficultyPolicy") &&
    appSource.includes("parseNhPolicyTsv"),
  "App should load selectable bot difficulty policies while preferring the Electron bridge for the medium default."
);
assert(
  packageSource.includes('"sync:policy": "node scripts/sync-default-policy.mjs"') &&
    packageSource.includes('"predev": "node scripts/sync-default-policy.mjs --optional"') &&
    packageSource.includes('"prebuild": "node scripts/sync-default-policy.mjs --optional"'),
  "package scripts should keep the web-served policy synced before local dev and local builds."
);
const policySummaries = policyVariantPaths.map((policyPath) => {
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
