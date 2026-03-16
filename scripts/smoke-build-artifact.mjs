import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const { assertBuildArtifactSmoke } = await import("../src/build-artifact-smoke.ts");

try {
  const result = await assertBuildArtifactSmoke({
    buildArtifactPath: resolve(repoRoot, "build", "extension.js"),
    rootArtifactPath: resolve(repoRoot, "extension.js"),
  });
  globalThis.process.stdout.write(
    `[roam-gtd] build artifact smoke passed (${result.sizeBytes} bytes)\n`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  globalThis.process.stderr.write(`[roam-gtd] build artifact smoke failed: ${message}\n`);
  globalThis.process.exit(1);
}
