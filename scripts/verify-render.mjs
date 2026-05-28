import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(projectRoot, "scripts", "render-parity-electron.cjs");
const defaultReferenceRoot = path.join(projectRoot, "fixtures", "reference", "client-render");
const defaultOutputRoot = process.env.NH_TRAINER_ARTIFACT_DIR ?? "C:\\nh-trainer-artifacts";

function parseArgs(argv) {
  const options = {
    referenceRoot: process.env.NH_CLIENT_REFERENCE_ROOT ?? defaultReferenceRoot,
    outputRoot: defaultOutputRoot
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--reference-root") {
      options.referenceRoot = path.resolve(argv[index + 1] ?? "");
      index += 1;
    } else if (arg === "--out") {
      options.outputRoot = path.resolve(argv[index + 1] ?? "");
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await mkdir(options.outputRoot, { recursive: true });

  const child = spawn(electronPath, [validatorPath, projectRoot, options.referenceRoot, options.outputRoot], {
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
    throw new Error(`render parity failed with code ${exitCode}\n${stderr}\n${stdout}`);
  }

  process.stdout.write(stdout);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
