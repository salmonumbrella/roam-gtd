import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrderedChildren: vi.fn(),
  runRoamQuery: vi.fn(),
  setBlockViewType: vi.fn(async () => undefined),
}));

vi.mock("../data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data")>();
  return {
    ...actual,
    runRoamQuery: mocks.runRoamQuery,
  };
});

vi.mock("../graph-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../graph-utils")>();
  return {
    ...actual,
    getOrderedChildren: mocks.getOrderedChildren,
  };
});

vi.mock("../roam-ui-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../roam-ui-utils")>();
  return {
    ...actual,
    setBlockViewType: mocks.setBlockViewType,
  };
});

import { createAgendaTodo, findAgendaBlockUid, syncDelegatedAgendaEntry } from "../people/agenda";

describe("people agenda helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("finds an existing agenda block by page title", () => {
    mocks.runRoamQuery.mockReturnValue([["agenda-uid"]]);

    expect(findAgendaBlockUid("Alice")).toBe("agenda-uid");
  });

  it("skips duplicate agenda todos when the plain ref already exists", async () => {
    mocks.runRoamQuery.mockImplementation((query: string) => {
      if (query.includes("clojure.string/starts-with?")) {
        return [["agenda-uid"]];
      }
      return [];
    });
    mocks.getOrderedChildren.mockImplementation((uid: string) =>
      uid === "agenda-uid" ? [{ order: 0, string: "((source-uid))", uid: "existing" }] : [],
    );
    const createBlock = vi.fn(async () => undefined);
    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { q: vi.fn() },
        util: { generateUID: vi.fn(() => "unused") },
      },
    });

    await createAgendaTodo("source-uid", "Alice");

    expect(createBlock).not.toHaveBeenCalled();
  });

  it("creates a delegated agenda parent, nests the due child, and marks it side-view", async () => {
    mocks.runRoamQuery.mockImplementation((query: string) => {
      if (query.includes("clojure.string/starts-with?")) {
        return [["agenda-uid"]];
      }
      return [];
    });
    mocks.getOrderedChildren.mockImplementation((uid: string) => {
      if (uid === "source-uid") {
        return [{ order: 0, string: "Due:: [[March 12th, 2026]]", uid: "due-child" }];
      }
      return [];
    });
    const createBlock = vi.fn(async () => undefined);
    const deleteBlock = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async () => undefined);
    const generateUID = vi
      .fn()
      .mockReturnValueOnce("agenda-parent-uid")
      .mockReturnValueOnce("nested-due-uid");
    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { q: vi.fn() },
        deleteBlock,
        updateBlock,
        util: { generateUID },
      },
    });

    await syncDelegatedAgendaEntry("source-uid", "Alice");

    expect(createBlock).toHaveBeenNthCalledWith(1, {
      block: { string: "((source-uid))", uid: "agenda-parent-uid" },
      location: { order: 0, "parent-uid": "agenda-uid" },
    });
    expect(createBlock).toHaveBeenNthCalledWith(2, {
      block: { string: "((due-child))", uid: "nested-due-uid" },
      location: { order: 0, "parent-uid": "agenda-parent-uid" },
    });
    expect(mocks.setBlockViewType).toHaveBeenCalledWith("agenda-parent-uid", "side");
    expect(deleteBlock).not.toHaveBeenCalled();
    expect(updateBlock).not.toHaveBeenCalled();
  });
});
