import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_SETTINGS } from "./fixtures";

const {
  buildAllUpTodoUidsQuery,
  buildUpTodosWithContextQuery,
  executeQuery,
  getOrCreatePageUid,
  getOrderedChildren,
} = vi.hoisted(() => ({
  buildAllUpTodoUidsQuery: vi.fn<(tagNextAction: string) => string>(),
  buildUpTodosWithContextQuery:
    vi.fn<(tagNextAction: string, excludeTags: Array<string>) => string>(),
  executeQuery: vi.fn<(query: string) => Promise<Array<ReadonlyArray<string | number>>>>(),
  getOrCreatePageUid: vi.fn<(pageTitle: string) => Promise<string>>(),
  getOrderedChildren:
    vi.fn<(uid: string) => Array<{ order?: number; string?: string; uid: string }>>(),
}));

vi.mock("../data", () => ({
  executeQuery,
}));

vi.mock("../graph-utils", () => ({
  getOrCreatePageUid,
  getOrderedChildren,
}));

vi.mock("../queries", () => ({
  buildAllUpTodoUidsQuery,
  buildUpTodosWithContextQuery,
}));

import { rebuildPlansPriorities } from "../planning/plans-priorities";

describe("rebuildPlansPriorities", () => {
  let createBlock: ReturnType<typeof vi.fn>;
  let deleteBlock: ReturnType<typeof vi.fn>;
  let generateUID: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createBlock = vi.fn(() => Promise.resolve());
    deleteBlock = vi.fn(() => Promise.resolve());
    generateUID = vi
      .fn()
      .mockReturnValueOnce("generated-1")
      .mockReturnValueOnce("generated-2")
      .mockReturnValueOnce("generated-3")
      .mockReturnValueOnce("generated-4")
      .mockReturnValueOnce("generated-5")
      .mockReturnValueOnce("generated-6")
      .mockReturnValueOnce("generated-7")
      .mockReturnValue("generated-final");

    executeQuery.mockReset();
    getOrCreatePageUid.mockReset();
    getOrderedChildren.mockReset();
    buildAllUpTodoUidsQuery.mockReset();
    buildUpTodosWithContextQuery.mockReset();

    buildUpTodosWithContextQuery.mockReturnValue("contexts-query");
    buildAllUpTodoUidsQuery.mockReturnValue("all-up-query");
    getOrCreatePageUid.mockResolvedValue("plans-page-uid");
    getOrderedChildren.mockReturnValue([{ uid: "existing-1" }, { uid: "existing-2" }]);

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        deleteBlock,
        util: {
          generateUID,
        },
      },
    });
  });

  it("clears existing children and writes an empty state when no next actions remain", async () => {
    executeQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await rebuildPlansPriorities(TEST_SETTINGS);

    expect(buildUpTodosWithContextQuery).toHaveBeenCalledWith("up", [
      "up",
      "watch",
      "delegated",
      "someday",
    ]);
    expect(buildAllUpTodoUidsQuery).toHaveBeenCalledWith("up");
    expect(getOrCreatePageUid).toHaveBeenCalledWith("Plans, Priorities");
    expect(getOrderedChildren).toHaveBeenCalledWith("plans-page-uid");
    expect(deleteBlock).toHaveBeenNthCalledWith(1, {
      block: { uid: "existing-1" },
    });
    expect(deleteBlock).toHaveBeenNthCalledWith(2, {
      block: { uid: "existing-2" },
    });
    expect(createBlock).toHaveBeenCalledTimes(1);
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "No active next actions", uid: "generated-1" },
      location: { order: "last", "parent-uid": "plans-page-uid" },
    });
  });

  it("groups todos by sorted context, dedupes repeated mappings, and appends a no-context section", async () => {
    executeQuery
      .mockResolvedValueOnce([
        ["todo-2", "Write proposal", "Work"],
        ["todo-1", "Call mom", "Home"],
        ["todo-2", "Write proposal", "Work"],
        ["todo-3", "Bad row"],
      ])
      .mockResolvedValueOnce([["todo-1"], ["todo-2"], ["todo-3"]]);

    await rebuildPlansPriorities(TEST_SETTINGS);

    expect(createBlock.mock.calls).toEqual([
      [
        {
          block: { string: "#[[Home]]", uid: "generated-1" },
          location: { order: "last", "parent-uid": "plans-page-uid" },
        },
      ],
      [
        {
          block: { string: "((todo-1))", uid: "generated-2" },
          location: { order: "last", "parent-uid": "generated-1" },
        },
      ],
      [
        {
          block: { string: "#[[Work]]", uid: "generated-3" },
          location: { order: "last", "parent-uid": "plans-page-uid" },
        },
      ],
      [
        {
          block: { string: "((todo-2))", uid: "generated-4" },
          location: { order: "last", "parent-uid": "generated-3" },
        },
      ],
      [
        {
          block: { string: "No context", uid: "generated-5" },
          location: { order: "last", "parent-uid": "plans-page-uid" },
        },
      ],
      [
        {
          block: { string: "((todo-3))", uid: "generated-6" },
          location: { order: "last", "parent-uid": "generated-5" },
        },
      ],
    ]);
  });
});
