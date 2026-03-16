import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { assertBuildArtifactSmoke } from "../build-artifact-smoke";

async function createArtifactFixture(
  rootContent: string | null,
  buildContent: string | null = rootContent,
): Promise<{
  buildArtifactPath: string;
  dir: string;
  rootArtifactPath: string;
}> {
  const dir = await mkdtemp(join(tmpdir(), "roam-gtd-build-smoke-"));
  const buildDir = join(dir, "build");
  const rootArtifactPath = join(dir, "extension.js");
  const buildArtifactPath = join(buildDir, "extension.js");

  await mkdir(buildDir, { recursive: true });
  if (rootContent !== null) {
    await writeFile(rootArtifactPath, rootContent, "utf8");
  }
  if (buildContent !== null) {
    await writeFile(buildArtifactPath, buildContent, "utf8");
  }

  return {
    buildArtifactPath,
    dir,
    rootArtifactPath,
  };
}

describe("build artifact smoke", () => {
  it("fails when the root extension artifact is missing", async () => {
    const fixture = await createArtifactFixture(null, "console.log('build');");

    await expect(
      assertBuildArtifactSmoke({
        buildArtifactPath: fixture.buildArtifactPath,
        rootArtifactPath: fixture.rootArtifactPath,
      }),
    ).rejects.toThrow(/missing build artifact/i);

    await rm(fixture.dir, { force: true, recursive: true });
  });

  it("fails when either artifact is empty", async () => {
    const fixture = await createArtifactFixture("", "");

    await expect(
      assertBuildArtifactSmoke({
        buildArtifactPath: fixture.buildArtifactPath,
        rootArtifactPath: fixture.rootArtifactPath,
      }),
    ).rejects.toThrow(/empty build artifact/i);

    await rm(fixture.dir, { force: true, recursive: true });
  });

  it("fails when the copied build artifact no longer matches the root bundle", async () => {
    const fixture = await createArtifactFixture("console.log('root');", "console.log('build');");

    await expect(
      assertBuildArtifactSmoke({
        buildArtifactPath: fixture.buildArtifactPath,
        rootArtifactPath: fixture.rootArtifactPath,
      }),
    ).rejects.toThrow(/does not match/i);

    await rm(fixture.dir, { force: true, recursive: true });
  });

  it("fails when the artifact still includes forbidden dev-only markers", async () => {
    const fixture = await createArtifactFixture("console.log('agentation localhost:4747');");

    await expect(
      assertBuildArtifactSmoke({
        buildArtifactPath: fixture.buildArtifactPath,
        rootArtifactPath: fixture.rootArtifactPath,
      }),
    ).rejects.toThrow(/forbidden dev-only marker/i);

    await rm(fixture.dir, { force: true, recursive: true });
  });

  it("returns the validated artifact metadata when both files are non-empty and identical", async () => {
    const fixture = await createArtifactFixture("console.log('release bundle');");

    await expect(
      assertBuildArtifactSmoke({
        buildArtifactPath: fixture.buildArtifactPath,
        rootArtifactPath: fixture.rootArtifactPath,
      }),
    ).resolves.toEqual({
      buildArtifactPath: fixture.buildArtifactPath,
      forbiddenMarkers: ["localhost:4747", "agentation"],
      rootArtifactPath: fixture.rootArtifactPath,
      sizeBytes: "console.log('release bundle');".length,
    });

    await rm(fixture.dir, { force: true, recursive: true });
  });
});
