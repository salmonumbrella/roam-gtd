import { readFile } from "node:fs/promises";

export const DEFAULT_BUILD_ARTIFACT_FORBIDDEN_MARKERS = ["localhost:4747", "agentation"] as const;

export interface BuildArtifactSmokeInput {
  buildArtifactPath: string;
  forbiddenMarkers?: Array<string>;
  rootArtifactPath: string;
}

export interface BuildArtifactSmokeResult {
  buildArtifactPath: string;
  forbiddenMarkers: Array<string>;
  rootArtifactPath: string;
  sizeBytes: number;
}

async function readRequiredArtifact(path: string): Promise<string> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch {
    throw new Error(`Missing build artifact: ${path}`);
  }

  if (content.length === 0) {
    throw new Error(`Empty build artifact: ${path}`);
  }

  return content;
}

export async function assertBuildArtifactSmoke({
  buildArtifactPath,
  forbiddenMarkers = [...DEFAULT_BUILD_ARTIFACT_FORBIDDEN_MARKERS],
  rootArtifactPath,
}: BuildArtifactSmokeInput): Promise<BuildArtifactSmokeResult> {
  const [rootArtifact, buildArtifact] = await Promise.all([
    readRequiredArtifact(rootArtifactPath),
    readRequiredArtifact(buildArtifactPath),
  ]);

  if (rootArtifact !== buildArtifact) {
    throw new Error(
      `Copied build artifact does not match root bundle: ${buildArtifactPath} vs ${rootArtifactPath}`,
    );
  }

  const forbiddenMarker = forbiddenMarkers.find((marker) => rootArtifact.includes(marker));
  if (forbiddenMarker) {
    throw new Error(`Build artifact contains forbidden dev-only marker: ${forbiddenMarker}`);
  }

  return {
    buildArtifactPath,
    forbiddenMarkers: [...forbiddenMarkers],
    rootArtifactPath,
    sizeBytes: rootArtifact.length,
  };
}
