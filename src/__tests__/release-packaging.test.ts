import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("release packaging", () => {
  it("marks the repo as private and does not expose a broken main entrypoint", () => {
    const packageJson = JSON.parse(readRepoFile("package.json")) as {
      devDependencies?: Record<string, string>;
      main?: string;
      private?: boolean;
      scripts?: Record<string, string>;
    };

    expect(packageJson.private).toBe(true);
    expect(packageJson.main).toBeUndefined();
    expect(packageJson.scripts?.["prebuild:roam"]).toBeUndefined();
    expect(packageJson.devDependencies?.agentation).toBeUndefined();
  });

  it("documents the hoisted install flow in contributor-facing surfaces", () => {
    const readme = readRepoFile("README.md");
    const ciWorkflow = readRepoFile(".github/workflows/ci.yml");
    const releaseWorkflow = readRepoFile(".github/workflows/release.yml");

    expect(readme).toContain("pnpm install --shamefully-hoist");
    expect(ciWorkflow).toContain("pnpm install --frozen-lockfile --shamefully-hoist");
    expect(releaseWorkflow).toContain("pnpm install --frozen-lockfile --shamefully-hoist");
  });

  it("includes the MIT license text in the repository", () => {
    const license = readRepoFile("LICENSE");

    expect(license).toContain("MIT License");
    expect(license).toContain("Permission is hereby granted, free of charge");
  });

  it("does not keep unused release-surface files around", () => {
    expect(existsSync(resolve(process.cwd(), "src/components/RoamInlinePreview.tsx"))).toBe(false);
  });
});
