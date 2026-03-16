import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cloneChildrenFromTemplate,
  getOrCreatePageUid,
  getPageUidByTitle,
  isSingleStringRow,
  runQuerySync,
} from "../graph-utils";

describe("isSingleStringRow", () => {
  it("returns true for a row with a single string element", () => {
    expect(isSingleStringRow(["abc"])).toBe(true);
  });

  it("returns true for a row with a string followed by other values", () => {
    expect(isSingleStringRow(["abc", 42])).toBe(true);
  });

  it("returns false for an empty row", () => {
    expect(isSingleStringRow([])).toBe(false);
  });

  it("returns false when first element is a number", () => {
    expect(isSingleStringRow([42])).toBe(false);
  });
});

describe("getPageUidByTitle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the uid when the page exists", () => {
    const q = vi.fn((_query: string, _title: string) => [["page-uid-123"]]);
    vi.stubGlobal("window", {
      roamAlphaAPI: { data: { q } },
    });

    expect(getPageUidByTitle("My Page")).toBe("page-uid-123");
    expect(q).toHaveBeenCalledTimes(1);
    expect(q).toHaveBeenCalledWith(expect.any(String), "My Page");
  });

  it("returns null when the page does not exist", () => {
    const q = vi.fn(() => []);
    vi.stubGlobal("window", {
      roamAlphaAPI: { data: { q } },
    });

    expect(getPageUidByTitle("Nonexistent")).toBeNull();
  });
});

describe("runQuerySync", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers fast.q when it is available", () => {
    const fastQ = vi.fn((_query: string, _title: string) => [["page-uid-fast"]]);
    const q = vi.fn((_query: string, _title: string) => [["page-uid-fallback"]]);
    vi.stubGlobal("window", {
      roamAlphaAPI: { data: { fast: { q: fastQ }, q } },
    });

    const rows = runQuerySync("test-query", "My Page");

    expect(fastQ).toHaveBeenCalledTimes(1);
    expect(q).not.toHaveBeenCalled();
    expect(rows).toEqual([["page-uid-fast"]]);
  });
});

describe("cloneChildrenFromTemplate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recursively clones children from source to target parent", async () => {
    const q = vi.fn((_query: string, ...inputs: Array<string>) => {
      if (inputs[0] === "source-uid") {
        return [
          ["child-1-uid", "Status:: #ON_TRACK", 0],
          ["child-2-uid", "Todo List::", 1],
        ];
      }
      if (inputs[0] === "child-2-uid") {
        return [["nested-uid", "Notes::", 0]];
      }
      return [];
    });
    const createBlock = vi.fn(async () => undefined);
    const generateUID = vi
      .fn()
      .mockReturnValueOnce("new-1")
      .mockReturnValueOnce("new-2")
      .mockReturnValueOnce("new-3");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { q },
        util: { generateUID },
      },
    });

    await cloneChildrenFromTemplate("source-uid", "target-uid");

    expect(createBlock).toHaveBeenCalledTimes(3);
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "Status:: #ON_TRACK", uid: "new-1" },
      location: { order: "last", "parent-uid": "target-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "Todo List::", uid: "new-2" },
      location: { order: "last", "parent-uid": "target-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "Notes::", uid: "new-3" },
      location: { order: "last", "parent-uid": "new-2" },
    });
  });
});

describe("getOrCreatePageUid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns existing uid without creating a page", async () => {
    const q = vi.fn(() => [["existing-uid"]]);
    const createPage = vi.fn();
    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createPage,
        data: { q },
        util: { generateUID: vi.fn() },
      },
    });

    const result = await getOrCreatePageUid("Existing Page");

    expect(result).toBe("existing-uid");
    expect(createPage).not.toHaveBeenCalled();
  });

  it("creates a new page and returns the generated uid", async () => {
    const q = vi.fn(() => []);
    const createPage = vi.fn(async () => undefined);
    const generateUID = vi.fn().mockReturnValue("new-page-uid");
    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createPage,
        data: { q },
        util: { generateUID },
      },
    });

    const result = await getOrCreatePageUid("New Page");

    expect(result).toBe("new-page-uid");
    expect(createPage).toHaveBeenCalledWith({
      page: { title: "New Page", uid: "new-page-uid" },
    });
  });
});
