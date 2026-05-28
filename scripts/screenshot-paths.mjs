import path from "node:path";

export const screenshotDir = process.env.NH_TRAINER_ARTIFACT_DIR ?? "C:\\nh-trainer-artifacts";

let screenshotCounter = 0;

export function uniqueScreenshotPath(label, extension = "png") {
  screenshotCounter += 1;
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, "");
  const safeLabel = label.replace(/[^A-Za-z0-9_.-]/g, "-");
  const safeExtension = extension.replace(/[^A-Za-z0-9]/g, "") || "png";
  return path.join(screenshotDir, `${safeLabel}-${timestamp}-${process.pid}-${screenshotCounter}.${safeExtension}`);
}
