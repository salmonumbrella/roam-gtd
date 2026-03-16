import { describe, expect, it, vi } from "vitest";

describe("pullEntities", () => {
  it("calls pull_many and returns results filtering nulls", async () => {
    const mockPullMany = vi.fn(() => [
      { ":block/string": "Project:: A", ":block/uid": "uid-1" },
      null,
      { ":block/string": "Project:: B", ":block/uid": "uid-2" },
    ]);
    vi.stubGlobal("window", {
      roamAlphaAPI: { data: { pull_many: mockPullMany } },
    });

    const { pullEntities } = await import("../data");
    const result = pullEntities("[:block/string :block/uid]", [100, 200, 300]);

    expect(mockPullMany).toHaveBeenCalledWith("[:block/string :block/uid]", [100, 200, 300]);
    expect(result).toEqual([
      { ":block/string": "Project:: A", ":block/uid": "uid-1" },
      { ":block/string": "Project:: B", ":block/uid": "uid-2" },
    ]);
  });

  it("returns empty array when pull_many is not available", async () => {
    vi.stubGlobal("window", {
      roamAlphaAPI: { data: {} },
    });

    const { pullEntities } = await import("../data");
    const result = pullEntities("[:block/string]", [100]);
    expect(result).toEqual([]);
  });
});
