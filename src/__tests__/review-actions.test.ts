import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendTag,
  archiveBlock,
  escapeRegex,
  removeHashTagForms,
  removeTagForms,
  removeTagFormsBatch,
  replaceTag,
  replaceTags,
  replaceTagsInText,
  replaceWithArchivedMarker,
  stripTodoStatusMarkers,
  markDone,
  removeTodoMarker,
} from "../review/actions";

describe("escapeRegex", () => {
  it("escapes special regex characters", () => {
    expect(escapeRegex("foo.bar")).toBe(String.raw`foo\.bar`);
    expect(escapeRegex("a+b*c?d")).toBe(String.raw`a\+b\*c\?d`);
    expect(escapeRegex("test[0]")).toBe(String.raw`test\[0\]`);
  });

  it("returns plain strings unchanged", () => {
    expect(escapeRegex("up")).toBe("up");
    expect(escapeRegex("someday")).toBe("someday");
  });
});

describe("removeTagForms", () => {
  it("removes #[[tag]] form", () => {
    expect(removeTagForms("Buy milk #[[up]]", "up")).toBe("Buy milk");
  });

  it("removes #tag form", () => {
    expect(removeTagForms("Buy milk #up", "up")).toBe("Buy milk");
  });

  it("removes [[tag]] form", () => {
    expect(removeTagForms("Buy milk [[up]]", "up")).toBe("Buy milk");
  });

  it("removes all three forms at once", () => {
    expect(removeTagForms("Buy milk #up [[up]] #[[up]]", "up")).toBe("Buy milk");
  });

  it("is case-insensitive", () => {
    expect(removeTagForms("Buy milk #UP", "up")).toBe("Buy milk");
    expect(removeTagForms("Buy milk #Up", "up")).toBe("Buy milk");
  });

  it("collapses double spaces after removal", () => {
    expect(removeTagForms("Buy #up milk", "up")).toBe("Buy milk");
  });

  it("does not remove partial matches", () => {
    expect(removeTagForms("Check #upgrade status", "up")).toBe("Check #upgrade status");
  });

  it("returns text unchanged when tag is empty", () => {
    expect(removeTagForms("Buy milk #up", "")).toBe("Buy milk #up");
  });

  it("handles tags with special regex characters", () => {
    expect(removeTagForms("task #[[some.tag]]", "some.tag")).toBe("task");
  });

  it("normalizes configured tag forms like #tag and [[tag]]", () => {
    expect(removeTagForms("Buy milk #up [[up]]", "#up")).toBe("Buy milk");
    expect(removeTagForms("Buy milk #up [[up]]", "[[up]]")).toBe("Buy milk");
  });
});

describe("removeHashTagForms", () => {
  it("removes hashtag forms but keeps plain page refs", () => {
    expect(removeHashTagForms("Buy #up [[up]] milk #[[up]]", "up")).toBe("Buy [[up]] milk");
  });

  it("normalizes configured tag forms", () => {
    expect(removeHashTagForms("Buy #up milk", "#up")).toBe("Buy milk");
    expect(removeHashTagForms("Buy #[[up]] milk", "[[up]]")).toBe("Buy milk");
  });
});

describe("removeTagFormsBatch", () => {
  it("dedupes normalized tags before removing them", () => {
    expect(removeTagFormsBatch("Buy #up [[watch]] #[[up]]", ["up", "#UP", "[[watch]]"])).toBe(
      "Buy",
    );
  });
});

describe("replaceTagsInText", () => {
  it("removes old tags and appends a new one when needed", () => {
    expect(replaceTagsInText("{{[[TODO]]}} Buy milk #[[watch]]", ["watch"], "up")).toBe(
      "{{[[TODO]]}} Buy milk #[[up]]",
    );
  });

  it("does not append the new tag when it is already present", () => {
    expect(replaceTagsInText("Buy milk #up #[[watch]]", ["watch"], "up")).toBe("Buy milk #up");
  });

  it("only removes old tags when the replacement is blank", () => {
    expect(replaceTagsInText("Buy milk #[[watch]]", ["watch"], null)).toBe("Buy milk");
  });
});

describe("stripTodoStatusMarkers", () => {
  it("removes leading legacy task markers and inner TODO/DONE macros", () => {
    expect(stripTodoStatusMarkers("{{[[TODO]]}} one {{[[DONE]]}} two")).toBe("one two");
    expect(stripTodoStatusMarkers("[[TODO]] one {{[[DONE]]}} two")).toBe("one two");
    expect(stripTodoStatusMarkers("DONE task")).toBe("task");
  });

  it("handles loosely-formatted macros", () => {
    expect(stripTodoStatusMarkers("{{ TODO }} task")).toBe("task");
    expect(stripTodoStatusMarkers("{{[[ DONE ]]}} task")).toBe("task");
  });

  it("keeps non-status text unchanged", () => {
    expect(stripTodoStatusMarkers("plain task #up")).toBe("plain task #up");
  });
});

describe("replaceTag", () => {
  let updatedBlocks: Array<{ string: string; uid: string }>;
  let pull: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updatedBlocks = [];
    pull = vi.fn(() => null);
    (globalThis as Record<string, unknown>).window = {
      roamAlphaAPI: {
        data: {
          pull,
        },
        updateBlock: vi.fn(({ block }: { block: { string: string; uid: string } }) => {
          updatedBlocks.push(block);
          return Promise.resolve();
        }),
      },
    };
  });

  it("adds new tag in #[[tag]] form", async () => {
    await replaceTag("uid1", "Triage", "up", "{{[[TODO]]}} Buy milk #[[Triage]]");
    expect(updatedBlocks).toHaveLength(1);
    expect(updatedBlocks[0].string).toBe("{{[[TODO]]}} Buy milk #[[up]]");
  });

  it("does not duplicate tag if already present as #[[tag]]", async () => {
    await replaceTag("uid1", "Triage", "up", "{{[[TODO]]}} Buy milk #[[up]] #[[Triage]]");
    expect(updatedBlocks).toHaveLength(1);
    expect(updatedBlocks[0].string).toBe("{{[[TODO]]}} Buy milk #[[up]]");
  });

  it("does not duplicate tag if already present as #tag", async () => {
    await replaceTag("uid1", "Triage", "up", "{{[[TODO]]}} Buy milk #up #[[Triage]]");
    expect(updatedBlocks).toHaveLength(1);
    expect(updatedBlocks[0].string).toContain("#up");
    expect(updatedBlocks[0].string).not.toContain("#[[up]]");
  });

  it("pulls source text when currentText is omitted", async () => {
    pull.mockReturnValue({ ":block/string": "{{[[TODO]]}} Buy milk #[[watch]]" });

    await replaceTag("uid1", "watch", "up");

    expect(updatedBlocks[0].string).toBe("{{[[TODO]]}} Buy milk #[[up]]");
  });
});

describe("replaceTags", () => {
  let pull: ReturnType<typeof vi.fn>;
  let updateBlock: ReturnType<typeof vi.fn>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    pull = vi.fn(() => null);
    updateBlock = vi.fn(() => Promise.resolve());
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    (globalThis as Record<string, unknown>).window = {
      roamAlphaAPI: {
        data: { pull },
        updateBlock,
      },
    };
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("returns false when the source block is missing", async () => {
    await expect(replaceTags("uid1", ["watch"], "up")).resolves.toBe(false);
    expect(updateBlock).not.toHaveBeenCalled();
  });

  it("returns false when replacing tags would not change the text", async () => {
    pull.mockReturnValue({ ":block/string": "Buy milk #up" });

    await expect(replaceTags("uid1", ["watch"], "up")).resolves.toBe(false);
    expect(updateBlock).not.toHaveBeenCalled();
  });

  it("returns true and updates the block when text changes", async () => {
    pull.mockReturnValue({ ":block/string": "Buy milk #[[watch]]" });

    await expect(replaceTags("uid1", ["watch"], "up")).resolves.toBe(true);
    expect(updateBlock).toHaveBeenCalledWith({
      block: { string: "Buy milk #[[up]]", uid: "uid1" },
    });
  });

  it("returns false and logs a warning when the write fails", async () => {
    pull.mockReturnValue({ ":block/string": "Buy milk #[[watch]]" });
    updateBlock.mockRejectedValueOnce(new Error("nope"));

    await expect(replaceTags("uid1", ["watch"], "up")).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith("[RoamGTD] replaceTag failed:", "uid1", expect.any(Error));
  });
});

describe("replaceWithArchivedMarker", () => {
  it("replaces {{[[TODO]]}} with {{[[ARCHIVED]]}}", () => {
    expect(replaceWithArchivedMarker("{{[[TODO]]}} Fix bug #up")).toBe(
      "{{[[ARCHIVED]]}} Fix bug #up",
    );
  });

  it("canonicalizes legacy TODO and DONE forms to {{[[ARCHIVED]]}}", () => {
    expect(replaceWithArchivedMarker("{{TODO}} Fix bug")).toBe("{{[[ARCHIVED]]}} Fix bug");
    expect(replaceWithArchivedMarker("[[TODO]] Fix bug")).toBe("{{[[ARCHIVED]]}} Fix bug");
    expect(replaceWithArchivedMarker("DONE Fix bug")).toBe("{{[[ARCHIVED]]}} Fix bug");
  });

  it("returns text unchanged when no TODO marker", () => {
    expect(replaceWithArchivedMarker("Fix bug #up")).toBe("Fix bug #up");
  });
});

describe("appendTag", () => {
  let updateBlock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateBlock = vi.fn(() => Promise.resolve());
    (globalThis as Record<string, unknown>).window = {
      roamAlphaAPI: {
        updateBlock,
      },
    };
  });

  it("does nothing when the tag is blank or already present", async () => {
    await appendTag("uid1", "   ", "Buy milk");
    await appendTag("uid1", "up", "Buy milk #up");
    await appendTag("uid1", "up", "Buy milk #[[up]]");

    expect(updateBlock).not.toHaveBeenCalled();
  });

  it("appends a normalized tag when missing", async () => {
    await appendTag("uid1", "[[up]]", "Buy milk");

    expect(updateBlock).toHaveBeenCalledWith({
      block: { string: "Buy milk #[[up]]", uid: "uid1" },
    });
  });
});

describe("archiveBlock", () => {
  let pull: ReturnType<typeof vi.fn>;
  let q: ReturnType<typeof vi.fn>;
  let updateBlock: ReturnType<typeof vi.fn>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    pull = vi.fn(() => ({ ":block/string": "{{[[TODO]]}} Buy milk #[[watch]] #[[up]]" }));
    q = vi.fn(() => [
      ["child-1", "Child #[[watch]]", 0],
      ["child-2", "Plain child", 1],
      ["malformed"],
    ]);
    updateBlock = vi.fn(() => Promise.resolve());
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    (globalThis as Record<string, unknown>).window = {
      roamAlphaAPI: {
        data: { pull, q },
        updateBlock,
      },
    };
  });

  it("archives the parent and strips workflow tags from tagged children", async () => {
    await archiveBlock("uid1", ["watch", "up"]);

    expect(updateBlock).toHaveBeenNthCalledWith(1, {
      block: { string: "{{[[ARCHIVED]]}} Buy milk", uid: "uid1" },
    });
    expect(updateBlock).toHaveBeenNthCalledWith(2, {
      block: { string: "Child", uid: "child-1" },
    });
    expect(updateBlock).toHaveBeenCalledTimes(2);
  });

  it("swallows write errors and logs a warning", async () => {
    updateBlock.mockRejectedValueOnce(new Error("boom"));

    await archiveBlock("uid1", ["watch", "up"]);

    expect(warn).toHaveBeenCalledWith("[RoamGTD] archiveBlock failed:", "uid1", expect.any(Error));
  });

  it("does nothing when the parent is already clean and no children match", async () => {
    pull.mockReturnValue({ ":block/string": "Buy milk" });
    q.mockReturnValue([["child-1", "Plain child", 0], ["child-2"]]);

    return expect(archiveBlock("uid1", ["watch", "up"]))
      .resolves.toBeUndefined()
      .then(() => {
        expect(updateBlock).not.toHaveBeenCalled();
      });
  });
});

describe("markDone", () => {
  let pull: ReturnType<typeof vi.fn>;
  let updateBlock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    pull = vi.fn(() => null);
    updateBlock = vi.fn(() => Promise.resolve());
    (globalThis as Record<string, unknown>).window = {
      roamAlphaAPI: {
        data: { pull },
        updateBlock,
      },
    };
  });

  it("returns false when the source block is missing or has no TODO marker", async () => {
    await expect(markDone("uid1")).resolves.toBe(false);
    pull.mockReturnValue({ ":block/string": "Buy milk" });
    await expect(markDone("uid1")).resolves.toBe(false);
    expect(updateBlock).not.toHaveBeenCalled();
  });

  it("replaces TODO with DONE when present", async () => {
    pull.mockReturnValue({ ":block/string": "{{[[TODO]]}} Buy milk" });

    await expect(markDone("uid1")).resolves.toBe(true);
    expect(updateBlock).toHaveBeenCalledWith({
      block: { string: "{{[[DONE]]}} Buy milk", uid: "uid1" },
    });
  });

  it("treats legacy TODO reads as todo and writes canonical DONE", async () => {
    pull.mockReturnValue({ ":block/string": "[[TODO]] Buy milk" });

    await expect(markDone("uid1")).resolves.toBe(true);
    expect(updateBlock).toHaveBeenCalledWith({
      block: { string: "{{[[DONE]]}} Buy milk", uid: "uid1" },
    });
  });

  it("returns false and logs a warning when the update fails", async () => {
    pull.mockReturnValue({ ":block/string": "{{[[TODO]]}} Buy milk" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    updateBlock.mockRejectedValueOnce(new Error("boom"));

    await expect(markDone("uid1")).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith("[RoamGTD] markDone failed:", "uid1", expect.any(Error));

    warn.mockRestore();
  });
});

describe("removeTodoMarker", () => {
  let pull: ReturnType<typeof vi.fn>;
  let updateBlock: ReturnType<typeof vi.fn>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    pull = vi.fn(() => null);
    updateBlock = vi.fn(() => Promise.resolve());
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    (globalThis as Record<string, unknown>).window = {
      roamAlphaAPI: {
        data: { pull },
        updateBlock,
      },
    };
  });

  it("removes TODO markers and skips unchanged content", async () => {
    pull.mockReturnValueOnce({ ":block/string": "{{[[TODO]]}} Buy milk" });
    await removeTodoMarker("uid1");
    expect(updateBlock).toHaveBeenCalledWith({
      block: { string: "Buy milk", uid: "uid1" },
    });

    updateBlock.mockClear();
    pull.mockReturnValueOnce({ ":block/string": "Buy milk" });
    await removeTodoMarker("uid1");
    expect(updateBlock).not.toHaveBeenCalled();
  });

  it("tolerates legacy leading task markers when removing them", async () => {
    pull.mockReturnValueOnce({ ":block/string": "[[TODO]] Buy milk" });
    await removeTodoMarker("uid1");
    expect(updateBlock).toHaveBeenCalledWith({
      block: { string: "Buy milk", uid: "uid1" },
    });
  });

  it("swallows errors and logs a warning", async () => {
    pull.mockImplementation(() => {
      throw new Error("nope");
    });

    await removeTodoMarker("uid1");

    expect(warn).toHaveBeenCalledWith(
      "[RoamGTD] removeTodoMarker failed:",
      "uid1",
      expect.any(Error),
    );
  });

  it("logs a warning when removing the marker fails during update", async () => {
    pull.mockReturnValue({ ":block/string": "{{[[TODO]]}} Buy milk" });
    updateBlock.mockRejectedValueOnce(new Error("nope"));

    await removeTodoMarker("uid1");

    expect(warn).toHaveBeenCalledWith(
      "[RoamGTD] removeTodoMarker failed:",
      "uid1",
      expect.any(Error),
    );
  });
});
