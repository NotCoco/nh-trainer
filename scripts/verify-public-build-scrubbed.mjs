import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.resolve(projectRoot, "dist");
const forbiddenTerms = [[..."kro"].join("") + [..."nos"].join("")];
const forbiddenTextMarkers = ["data-source-"];
const maxFindings = 50;

function assertDistRoot() {
  if (!fs.existsSync(distRoot) || !fs.statSync(distRoot).isDirectory()) {
    throw new Error(`public build folder does not exist: ${distRoot}`);
  }
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

function addFinding(findings, finding) {
  if (findings.length < maxFindings) {
    findings.push(finding);
  }
}

function verifyPath(findings, itemPath) {
  const relativePath = path.relative(distRoot, itemPath).replace(/\\/g, "/");
  const lowerPath = relativePath.toLowerCase();

  for (const term of forbiddenTerms) {
    if (lowerPath.includes(term)) {
      addFinding(findings, { type: "path", term, path: relativePath });
    }
  }

  if (relativePath.endsWith(".map")) {
    addFinding(findings, { type: "sourcemap", path: relativePath });
  }
}

function verifyContent(findings, filePath) {
  const relativePath = path.relative(distRoot, filePath).replace(/\\/g, "/");
  const buffer = fs.readFileSync(filePath);
  const lowerText = buffer.toString("latin1").toLowerCase();

  for (const term of forbiddenTerms) {
    const index = lowerText.indexOf(term);

    if (index !== -1) {
      addFinding(findings, { type: "content", term, path: relativePath, index });
    }
  }

  const text = buffer.toString("utf8");

  for (const marker of forbiddenTextMarkers) {
    const index = text.indexOf(marker);

    if (index !== -1) {
      addFinding(findings, { type: "public-debug-attr", marker, path: relativePath, index });
    }
  }
}

assertDistRoot();

const { files, dirs } = walk(distRoot);
const findings = [];

for (const dirPath of dirs) {
  verifyPath(findings, dirPath);
}

for (const filePath of files) {
  verifyPath(findings, filePath);
  verifyContent(findings, filePath);
}

if (findings.length > 0) {
  console.error(JSON.stringify({ distRoot, findings }, null, 2));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        distRoot,
        files: files.length,
        status: "public build is scrubbed"
      },
      null,
      2
    )
  );
}
