import { afterEach, describe, expect, it, vi } from "vitest";

import { spawnNextActionsIntoPage } from "../planning/daily-note-next-actions";
import { TEST_SETTINGS } from "./fixtures";

const mocks = vi.hoisted(() => ({
  deleteBlock: vi.fn(async (_uid: string) => undefined),
}));

vi.mock("roamjs-components/writes/deleteBlock", () => ({
  default: mocks.deleteBlock,
}));

const SETTINGS = TEST_SETTINGS;

describe("spawnNextActionsIntoPage", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("creates Plans/Priorities structure and inserts grouped block refs directly under it", async () => {
    const q = vi.fn((query: string, ..._inputs: Array<unknown>) => {
      if (query.includes(":find ?uid ?s ?page-title ?edit-time ?tag-title")) {
        return [
          ["u1", "{{[[TODO]]}} one #up #Home", "Page", 1, "up"],
          ["u2", "{{[[TODO]]}} two #up", "Page", 2, "up"],
        ];
      }
      if (query.includes(":find ?uid") && query.includes(":node/title ?title")) {
        return [];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        return [];
      }
      return [];
    });

    const createBlock = vi.fn(async () => undefined);
    const createPage = vi.fn(async () => undefined);
    const pull = vi.fn(() => null);
    const generateUID = vi
      .fn()
      .mockReturnValueOnce("new-page-uid")
      .mockReturnValueOnce("plans-uid")
      .mockReturnValueOnce("home-group-uid")
      .mockReturnValueOnce("home-item-uid")
      .mockReturnValueOnce("none-item-uid");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        createPage,
        data: { pull, q },
        util: { generateUID },
      },
    });

    const result = await spawnNextActionsIntoPage(SETTINGS, "February 25th, 2026");

    expect(createPage).toHaveBeenCalledWith({
      page: { title: "February 25th, 2026", uid: "new-page-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { open: false, string: "[[Plans, Priorities]]", uid: "plans-uid" },
      location: { order: "last", "parent-uid": "new-page-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { open: false, string: "#Home", uid: "home-group-uid" },
      location: { order: "last", "parent-uid": "plans-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((u1))", uid: "home-item-uid" },
      location: { order: "last", "parent-uid": "home-group-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((u2))", uid: "none-item-uid" },
      location: { order: "last", "parent-uid": "plans-uid" },
    });
    expect(mocks.deleteBlock).not.toHaveBeenCalled();
    expect(result).toEqual({
      groupCount: 1,
      itemCount: 2,
      pageTitle: "February 25th, 2026",
      parentUid: "plans-uid",
    });
  });

  it("removes legacy wrappers and refreshes generated context groups under Plans/Priorities", async () => {
    const childrenByParent = new Map<string, Array<[string, string, number]>>([
      ["today-uid", [["plans-uid", "[[Plans, Priorities]]", 0]]],
      [
        "plans-uid",
        [
          ["section-uid", "Next Actions", 0],
          ["old-group-uid", "#Home", 1],
          ["manual-note-uid", "My manual planning note", 2],
        ],
      ],
      ["section-uid", [["generated-root-uid", "roam-gtd::next-actions-generated", 0]]],
      ["old-group-uid", [["old-item-uid", "((old-item))", 0]]],
    ]);

    const q = vi.fn((query: string, ...inputs: Array<string>) => {
      if (query.includes(":find ?uid ?s ?page-title ?edit-time ?tag-title")) {
        return [["u1", "{{[[TODO]]}} one #up #Home", "Page", 1, "up"]];
      }
      if (query.includes(":find ?uid") && query.includes(":node/title ?title")) {
        if (inputs[0] === "February 25th, 2026") {
          return [["today-uid"]];
        }
        return [];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        const parentUid = inputs[0];
        return childrenByParent.get(parentUid) ?? [];
      }
      return [];
    });

    const createBlock = vi.fn(async () => undefined);
    const createPage = vi.fn(async () => undefined);
    const pull = vi.fn(() => null);
    mocks.deleteBlock.mockImplementation(async (uid: string) => {
      for (const [parentUid, children] of childrenByParent.entries()) {
        const nextChildren = children.filter((child) => child[0] !== uid);
        if (nextChildren.length !== children.length) {
          childrenByParent.set(parentUid, nextChildren);
          break;
        }
      }
      childrenByParent.delete(uid);
    });
    const generateUID = vi
      .fn()
      .mockReturnValueOnce("new-group-uid")
      .mockReturnValueOnce("new-item-uid");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        createPage,
        data: { pull, q },
        util: { generateUID },
      },
    });

    const result = await spawnNextActionsIntoPage(SETTINGS, "February 25th, 2026");

    expect(createPage).not.toHaveBeenCalled();
    expect(mocks.deleteBlock).toHaveBeenCalledTimes(3);
    expect(mocks.deleteBlock).toHaveBeenNthCalledWith(1, "generated-root-uid");
    expect(mocks.deleteBlock).toHaveBeenNthCalledWith(2, "section-uid");
    expect(mocks.deleteBlock).toHaveBeenNthCalledWith(3, "old-group-uid");
    expect(createBlock).toHaveBeenCalledWith({
      block: { open: false, string: "#Home", uid: "new-group-uid" },
      location: { order: "last", "parent-uid": "plans-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((u1))", uid: "new-item-uid" },
      location: { order: "last", "parent-uid": "new-group-uid" },
    });
    expect(result).toEqual({
      groupCount: 1,
      itemCount: 1,
      pageTitle: "February 25th, 2026",
      parentUid: "plans-uid",
    });
  });

  it("clears old scheduled wrappers when the source block later becomes a next action", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T12:00:00.000Z"));
    const childrenByParent = new Map<string, Array<[string, string, number]>>([
      ["today-uid", [["plans-uid", "[[Plans, Priorities]]", 0]]],
      ["plans-uid", [["old-scheduled-wrapper-uid", "[[TODO]] ((scheduled-parent-uid))", 0]]],
      [
        "old-scheduled-wrapper-uid",
        [["old-scheduled-child-ref-uid", "((scheduled-child-uid))", 0]],
      ],
    ]);

    const q = vi.fn((query: string, ...inputs: Array<unknown>) => {
      if (query.includes(":find ?uid ?s ?page-title ?edit-time ?tag-title")) {
        return [["scheduled-parent-uid", "[[TODO]] call #up", "Page", 1, "up"]];
      }
      if (query.includes(":find ?parent-uid ?parent-string ?child-uid ?child-string ?order")) {
        return [
          [
            "scheduled-parent-uid",
            "[[TODO]] call #up",
            "scheduled-child-uid",
            "Due:: [[February 25th, 2026]]",
            0,
          ],
        ];
      }
      if (query.includes(":find ?title") && query.includes(":log/id _")) {
        return [["February 25th, 2026"]];
      }
      if (query.includes(":find ?uid") && query.includes(":node/title ?title")) {
        if (inputs[0] === "February 25th, 2026") {
          return [["today-uid"]];
        }
        return [];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        return childrenByParent.get(inputs[0] as string) ?? [];
      }
      if (query.includes(":find ?parent-uid")) {
        return [];
      }
      if (query.includes(":find ?view-str") && query.includes(":block/view-type")) {
        return [];
      }
      return [];
    });

    const createBlock = vi.fn(async () => undefined);
    const createPage = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async () => undefined);
    const pull = vi.fn((_: string, key: readonly [string, string]) => {
      if (key[1] === "scheduled-parent-uid") {
        return { ":block/string": "[[TODO]] call #up" };
      }
      if (key[1] === "scheduled-child-uid") {
        return { ":block/string": "Due:: [[February 25th, 2026]]" };
      }
      return null;
    });
    mocks.deleteBlock.mockImplementation(async (uid: string) => {
      for (const [parentUid, children] of childrenByParent.entries()) {
        const nextChildren = children.filter((child) => child[0] !== uid);
        if (nextChildren.length !== children.length) {
          childrenByParent.set(parentUid, nextChildren);
          break;
        }
      }
      childrenByParent.delete(uid);
    });
    const generateUID = vi
      .fn()
      .mockReturnValueOnce("new-item-uid")
      .mockReturnValueOnce("new-scheduled-child-ref-uid");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        createPage,
        data: { pull, q },
        updateBlock,
        util: { generateUID },
      },
    });

    await spawnNextActionsIntoPage(SETTINGS, "February 25th, 2026");

    expect(mocks.deleteBlock).toHaveBeenCalledWith("old-scheduled-wrapper-uid");
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((scheduled-parent-uid))", uid: "new-item-uid" },
      location: { order: "last", "parent-uid": "plans-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((scheduled-child-uid))", uid: "new-scheduled-child-ref-uid" },
      location: { order: "last", "parent-uid": "new-item-uid" },
    });
  });

  it("uses configured daily-plan parent block text from settings", async () => {
    const q = vi.fn((query: string) => {
      if (query.includes(":find ?uid ?s ?page-title ?edit-time ?tag-title")) {
        return [["u1", "{{[[TODO]]}} one #up", "Page", 1, "up"]];
      }
      if (query.includes(":find ?uid") && query.includes(":node/title ?title")) {
        return [];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        return [];
      }
      return [];
    });

    const createBlock = vi.fn(async () => undefined);
    const createPage = vi.fn(async () => undefined);
    const pull = vi.fn(() => null);
    const generateUID = vi
      .fn()
      .mockReturnValueOnce("new-page-uid")
      .mockReturnValueOnce("custom-parent-uid")
      .mockReturnValueOnce("item-uid");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        createPage,
        data: { pull, q },
        util: { generateUID },
      },
    });

    await spawnNextActionsIntoPage(
      {
        ...SETTINGS,
        dailyPlanParent: "[[My Custom Parent]]",
      },
      "February 25th, 2026",
    );

    expect(createBlock).toHaveBeenCalledWith({
      block: { open: false, string: "[[My Custom Parent]]", uid: "custom-parent-uid" },
      location: { order: "last", "parent-uid": "new-page-uid" },
    });
  });

  it("nests project refs under todo refs and marks project todos as side view", async () => {
    const viewTypeByUid = new Map<string, string>();

    const q = vi.fn((query: string, ...inputs: Array<string>) => {
      if (query.includes(":find ?uid ?s ?page-title ?edit-time ?tag-title")) {
        return [
          ["u1", "{{[[TODO]]}} one #up #Home", "Page", 1, "up"],
          ["u2", "{{[[TODO]]}} two #up", "Page", 2, "up"],
          ["u3", "{{[[TODO]]}} three #up", "Page", 3, "up"],
        ];
      }
      if (query.includes(":find ?view-str") && query.includes(":block/view-type")) {
        const value = viewTypeByUid.get(inputs[0]);
        return value ? [[value]] : [];
      }
      if (query.includes(":find ?view-str") && query.includes(":children/view-type")) {
        const value = viewTypeByUid.get(inputs[0]);
        return value ? [[value]] : [];
      }
      if (query.includes(":find ?uid") && query.includes(":node/title ?title")) {
        return [];
      }
      if (query.includes(":find ?parent-uid")) {
        if (inputs[0] === "u1" || inputs[0] === "u2") {
          return [["todo-list-uid"]];
        }
        if (inputs[0] === "todo-list-uid") {
          return [["project-uid"]];
        }
        return [];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        return [];
      }
      return [];
    });

    const createBlock = vi.fn(async () => undefined);
    const createPage = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async (input: { block: Record<string, string> }) => {
      const uid = input.block.uid;
      if (!uid) {
        return;
      }
      const viewType = input.block["block-view-type"];
      if (typeof viewType === "string") {
        viewTypeByUid.set(uid, viewType);
      }
    });
    const pull = vi.fn((_: string, key: readonly [string, string]) => {
      if (key[1] === "todo-list-uid") {
        return { ":block/string": "Todo List:: 0/5" };
      }
      if (key[1] === "project-uid") {
        return { ":block/string": "Project:: Apple Pie" };
      }
      return null;
    });
    const generateUID = vi
      .fn()
      .mockReturnValueOnce("new-page-uid")
      .mockReturnValueOnce("plans-uid")
      .mockReturnValueOnce("home-group-uid")
      .mockReturnValueOnce("home-todo-ref-uid")
      .mockReturnValueOnce("home-project-ref-uid")
      .mockReturnValueOnce("no-context-project-todo-ref-uid")
      .mockReturnValueOnce("no-context-project-ref-uid")
      .mockReturnValueOnce("no-context-direct-todo-ref-uid");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        createPage,
        data: { pull, q },
        updateBlock,
        util: { generateUID },
      },
    });

    const result = await spawnNextActionsIntoPage(SETTINGS, "February 25th, 2026");

    expect(createBlock).toHaveBeenCalledWith({
      block: { open: false, string: "#Home", uid: "home-group-uid" },
      location: { order: "last", "parent-uid": "plans-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((u1))", uid: "home-todo-ref-uid" },
      location: { order: "last", "parent-uid": "home-group-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((project-uid))", uid: "home-project-ref-uid" },
      location: { order: "last", "parent-uid": "home-todo-ref-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((u2))", uid: "no-context-project-todo-ref-uid" },
      location: { order: "last", "parent-uid": "plans-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((project-uid))", uid: "no-context-project-ref-uid" },
      location: { order: "last", "parent-uid": "no-context-project-todo-ref-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((u3))", uid: "no-context-direct-todo-ref-uid" },
      location: { order: "last", "parent-uid": "plans-uid" },
    });
    expect(updateBlock).toHaveBeenNthCalledWith(1, {
      block: { "block-view-type": "side", uid: "home-todo-ref-uid" },
    });
    expect(updateBlock).toHaveBeenNthCalledWith(2, {
      block: { "block-view-type": "side", uid: "no-context-project-todo-ref-uid" },
    });
    expect(result).toEqual({
      groupCount: 1,
      itemCount: 3,
      pageTitle: "February 25th, 2026",
      parentUid: "plans-uid",
    });
  });

  it("attaches matching Due/Reminder child refs and only uses side view on today's daily note", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T12:00:00.000Z"));
    const viewTypeByUid = new Map<string, string>();

    const q = vi.fn((query: string, ...inputs: Array<unknown>) => {
      if (query.includes(":find ?uid ?s ?page-title ?edit-time ?tag-title")) {
        return [
          ["u1", "{{[[TODO]]}} one #up", "Page", 1, "up"],
          ["u2", "{{[[TODO]]}} two #up", "Page", 2, "up"],
          ["u3", "{{[[TODO]]}} three #up", "Page", 3, "up"],
        ];
      }
      if (query.includes(":find ?parent-uid ?parent-string ?child-uid ?child-string ?order")) {
        return [
          ["u1", "{{[[TODO]]}} one #up", "u1-due-child", "Due:: [[February 25th, 2026]]", 0],
          [
            "u2",
            "{{[[TODO]]}} two #up",
            "u2-reminder-child",
            "Reminder:: [[February 26th, 2026]]",
            0,
          ],
          ["u3", "{{[[TODO]]}} three #up", "u3-due-child", "Due:: February 25th, 2026 #Home", 0],
        ];
      }
      if (query.includes(":find ?title") && query.includes(":log/id _")) {
        return [["February 25th, 2026"], ["February 26th, 2026"]];
      }
      if (query.includes(":find ?view-str") && query.includes(":block/view-type")) {
        const value = viewTypeByUid.get(inputs[0] as string);
        return value ? [[value]] : [];
      }
      if (query.includes(":find ?uid") && query.includes(":node/title ?title")) {
        return [];
      }
      if (query.includes(":find ?parent-uid")) {
        return [];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        return [];
      }
      return [];
    });

    const createBlock = vi.fn(async () => undefined);
    const createPage = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async (input: { block: Record<string, string> }) => {
      const uid = input.block.uid;
      if (!uid) {
        return;
      }
      const viewType = input.block["block-view-type"];
      if (typeof viewType === "string") {
        viewTypeByUid.set(uid, viewType);
      }
    });
    const pull = vi.fn(() => null);
    const generateUID = vi
      .fn()
      .mockReturnValueOnce("new-page-uid")
      .mockReturnValueOnce("plans-uid")
      .mockReturnValueOnce("u1-todo-ref-uid")
      .mockReturnValueOnce("u1-due-ref-uid")
      .mockReturnValueOnce("u3-todo-ref-uid")
      .mockReturnValueOnce("u3-due-ref-uid");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        createPage,
        data: { pull, q },
        updateBlock,
        util: { generateUID },
      },
    });

    const result = await spawnNextActionsIntoPage(SETTINGS, "February 25th, 2026");

    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((u1-due-child))", uid: "u1-due-ref-uid" },
      location: { order: "last", "parent-uid": "u1-todo-ref-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((u3-due-child))", uid: "u3-due-ref-uid" },
      location: { order: "last", "parent-uid": "u3-todo-ref-uid" },
    });
    expect(createBlock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        block: expect.objectContaining({ string: "((u2-reminder-child))" }),
      }),
    );
    expect(updateBlock).toHaveBeenCalledTimes(2);
    expect(updateBlock).toHaveBeenNthCalledWith(1, {
      block: { "block-view-type": "side", uid: "u1-todo-ref-uid" },
    });
    expect(updateBlock).toHaveBeenNthCalledWith(2, {
      block: { "block-view-type": "side", uid: "u3-todo-ref-uid" },
    });
    expect(result).toEqual({
      groupCount: 0,
      itemCount: 2,
      pageTitle: "February 25th, 2026",
      parentUid: "plans-uid",
    });
  });

  it("keeps matching scheduled child refs nested but not side-view when spawning a future day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T12:00:00.000Z"));
    const viewTypeByUid = new Map<string, string>();

    const q = vi.fn((query: string, ...inputs: Array<unknown>) => {
      if (query.includes(":find ?uid ?s ?page-title ?edit-time ?tag-title")) {
        return [["u1", "{{[[TODO]]}} one #up", "Page", 1, "up"]];
      }
      if (query.includes(":find ?parent-uid ?parent-string ?child-uid ?child-string ?order")) {
        return [["u1", "{{[[TODO]]}} one #up", "u1-due-child", "Due:: [[February 26th, 2026]]", 0]];
      }
      if (query.includes(":find ?title") && query.includes(":log/id _")) {
        return [["February 26th, 2026"]];
      }
      if (query.includes(":find ?view-str") && query.includes(":block/view-type")) {
        const value = viewTypeByUid.get(inputs[0] as string);
        return value ? [[value]] : [];
      }
      if (query.includes(":find ?uid") && query.includes(":node/title ?title")) {
        return [];
      }
      if (query.includes(":find ?parent-uid")) {
        return [];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        return [];
      }
      return [];
    });

    const createBlock = vi.fn(async () => undefined);
    const createPage = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async (input: { block: Record<string, string> }) => {
      const uid = input.block.uid;
      const viewType = input.block["block-view-type"];
      if (uid && typeof viewType === "string") {
        viewTypeByUid.set(uid, viewType);
      }
    });
    const pull = vi.fn(() => null);
    const generateUID = vi
      .fn()
      .mockReturnValueOnce("new-page-uid")
      .mockReturnValueOnce("plans-uid")
      .mockReturnValueOnce("u1-todo-ref-uid")
      .mockReturnValueOnce("u1-due-ref-uid");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        createPage,
        data: { pull, q },
        updateBlock,
        util: { generateUID },
      },
    });

    await spawnNextActionsIntoPage(SETTINGS, "February 26th, 2026");

    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((u1-due-child))", uid: "u1-due-ref-uid" },
      location: { order: "last", "parent-uid": "u1-todo-ref-uid" },
    });
    expect(updateBlock).not.toHaveBeenCalled();
  });

  it("suppresses #up todos with due dates until their exact scheduled day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T12:00:00.000Z"));

    const q = vi.fn((query: string, ..._inputs: Array<unknown>) => {
      if (query.includes(":find ?uid ?s ?page-title ?edit-time ?tag-title")) {
        return [
          ["u1", "{{[[TODO]]}} one #up", "Page", 1, "up"],
          ["u2", "{{[[TODO]]}} two #up", "Page", 2, "up"],
        ];
      }
      if (query.includes(":find ?parent-uid ?parent-string ?child-uid ?child-string ?order")) {
        return [["u2", "{{[[TODO]]}} two #up", "u2-due-child", "Due:: [[February 26th, 2026]]", 0]];
      }
      if (query.includes(":find ?title") && query.includes(":log/id _")) {
        return [["February 26th, 2026"]];
      }
      if (query.includes(":find ?uid") && query.includes(":node/title ?title")) {
        return [];
      }
      if (query.includes(":find ?parent-uid")) {
        return [];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        return [];
      }
      if (query.includes(":find ?view-str") && query.includes(":block/view-type")) {
        return [];
      }
      return [];
    });

    const createBlock = vi.fn(async () => undefined);
    const createPage = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async () => undefined);
    const pull = vi.fn(() => null);
    const generateUID = vi
      .fn()
      .mockReturnValueOnce("new-page-uid")
      .mockReturnValueOnce("plans-uid")
      .mockReturnValueOnce("u1-ref-uid");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        createPage,
        data: { pull, q },
        updateBlock,
        util: { generateUID },
      },
    });

    await spawnNextActionsIntoPage(SETTINGS, "February 25th, 2026");

    expect(createBlock).toHaveBeenCalledWith({
      block: { open: false, string: "[[Plans, Priorities]]", uid: "plans-uid" },
      location: { order: "last", "parent-uid": "new-page-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((u1))", uid: "u1-ref-uid" },
      location: { order: "last", "parent-uid": "plans-uid" },
    });
    expect(createBlock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        block: expect.objectContaining({ string: "((u2))" }),
      }),
    );
  });

  it("adds non-#up scheduled parents directly under Plans/Priorities and prefixes canonical TODO when needed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T12:00:00.000Z"));
    const viewTypeByUid = new Map<string, string>();

    const q = vi.fn((query: string, ...inputs: Array<unknown>) => {
      if (query.includes(":find ?uid ?s ?page-title ?edit-time ?tag-title")) {
        return [];
      }
      if (query.includes(":find ?parent-uid ?parent-string ?child-uid ?child-string ?order")) {
        return [
          [
            "plain-parent-uid",
            "Call the bank",
            "plain-reminder-child",
            "Reminder:: [[February 25th, 2026]]",
            0,
          ],
          [
            "todo-parent-uid",
            "[[TODO]] Review draft",
            "todo-due-child",
            "Due:: [[February 25th, 2026]]",
            0,
          ],
          [
            "legacy-bare-parent-uid",
            "TODO Review bare draft",
            "legacy-bare-due-child",
            "Due:: [[February 25th, 2026]]",
            0,
          ],
        ];
      }
      if (query.includes(":find ?title") && query.includes(":log/id _")) {
        return [["February 25th, 2026"]];
      }
      if (query.includes(":find ?view-str") && query.includes(":block/view-type")) {
        const value = viewTypeByUid.get(inputs[0] as string);
        return value ? [[value]] : [];
      }
      if (query.includes(":find ?uid") && query.includes(":node/title ?title")) {
        return [];
      }
      if (query.includes(":find ?parent-uid")) {
        return [];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        return [];
      }
      return [];
    });

    const createBlock = vi.fn(async () => undefined);
    const createPage = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async (input: { block: Record<string, string> }) => {
      const uid = input.block.uid;
      const viewType = input.block["block-view-type"];
      if (uid && typeof viewType === "string") {
        viewTypeByUid.set(uid, viewType);
      }
    });
    const pull = vi.fn(() => null);
    const generateUID = vi
      .fn()
      .mockReturnValueOnce("new-page-uid")
      .mockReturnValueOnce("plans-uid")
      .mockReturnValueOnce("plain-parent-ref-uid")
      .mockReturnValueOnce("plain-reminder-ref-uid")
      .mockReturnValueOnce("todo-parent-ref-uid")
      .mockReturnValueOnce("todo-due-ref-uid")
      .mockReturnValueOnce("legacy-bare-parent-ref-uid")
      .mockReturnValueOnce("legacy-bare-due-ref-uid");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        createPage,
        data: { pull, q },
        updateBlock,
        util: { generateUID },
      },
    });

    const result = await spawnNextActionsIntoPage(SETTINGS, "February 25th, 2026");

    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "{{[[TODO]]}} ((plain-parent-uid))", uid: "plain-parent-ref-uid" },
      location: { order: "last", "parent-uid": "plans-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((plain-reminder-child))", uid: "plain-reminder-ref-uid" },
      location: { order: "last", "parent-uid": "plain-parent-ref-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((todo-parent-uid))", uid: "todo-parent-ref-uid" },
      location: { order: "last", "parent-uid": "plans-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((todo-due-child))", uid: "todo-due-ref-uid" },
      location: { order: "last", "parent-uid": "todo-parent-ref-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((legacy-bare-parent-uid))", uid: "legacy-bare-parent-ref-uid" },
      location: { order: "last", "parent-uid": "plans-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((legacy-bare-due-child))", uid: "legacy-bare-due-ref-uid" },
      location: { order: "last", "parent-uid": "legacy-bare-parent-ref-uid" },
    });
    expect(updateBlock).toHaveBeenNthCalledWith(1, {
      block: { "block-view-type": "side", uid: "plain-parent-ref-uid" },
    });
    expect(updateBlock).toHaveBeenNthCalledWith(2, {
      block: { "block-view-type": "side", uid: "todo-parent-ref-uid" },
    });
    expect(updateBlock).toHaveBeenNthCalledWith(3, {
      block: { "block-view-type": "side", uid: "legacy-bare-parent-ref-uid" },
    });
    expect(result).toEqual({
      groupCount: 0,
      itemCount: 3,
      pageTitle: "February 25th, 2026",
      parentUid: "plans-uid",
    });
  });

  it("ignores page-ref Due/Reminder matches when the referenced page is not a daily note", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-25T12:00:00.000Z"));

    const q = vi.fn((query: string, ..._inputs: Array<unknown>) => {
      if (query.includes(":find ?uid ?s ?page-title ?edit-time ?tag-title")) {
        return [];
      }
      if (query.includes(":find ?parent-uid ?parent-string ?child-uid ?child-string ?order")) {
        return [
          [
            "plain-parent-uid",
            "Call the bank",
            "plain-reminder-child",
            "Reminder:: [[February 25th, 2026]]",
            0,
          ],
        ];
      }
      if (query.includes(":find ?title") && query.includes(":log/id _")) {
        return [];
      }
      if (query.includes(":find ?uid") && query.includes(":node/title ?title")) {
        return [];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        return [];
      }
      return [];
    });

    const createBlock = vi.fn(async () => undefined);
    const createPage = vi.fn(async () => undefined);
    const pull = vi.fn(() => null);
    const generateUID = vi
      .fn()
      .mockReturnValueOnce("new-page-uid")
      .mockReturnValueOnce("plans-uid");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        createPage,
        data: { pull, q },
        util: { generateUID },
      },
    });

    const result = await spawnNextActionsIntoPage(SETTINGS, "February 25th, 2026");

    expect(createBlock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      groupCount: 0,
      itemCount: 0,
      pageTitle: "February 25th, 2026",
      parentUid: "plans-uid",
    });
  });
});
