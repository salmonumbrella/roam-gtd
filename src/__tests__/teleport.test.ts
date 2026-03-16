import { afterEach, describe, expect, it, vi } from "vitest";

import { formatRoamDate } from "../date-utils";
import {
  createProjectFromTemplateAndTeleportTodo,
  fetchAllProjects,
  fetchActiveProjects,
  reactivateProjectStatusIfInactive,
  teleportBlockToProject,
  teleportBlockToWorkflowLocation,
} from "../teleport";

describe("fetchActiveProjects", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ranks active projects by latest interaction and deduplicates by uid", async () => {
    const q = vi.fn((query: string, ..._inputs: Array<string>) => {
      if (
        query.includes(":find ?page-title ?project-block-uid ?project-str (max ?interaction-time)")
      ) {
        return [
          ["Project Alpha", "uid-open", "Project:: [[Project Alpha]]", 2000],
          [
            "February 24th, 2026",
            "uid-scale",
            "Project:: Scale [[Acme/Fulfillment]] to different locations",
            7000,
          ],
          ["Project Alpha", "uid-open", "Project:: [[Project Alpha]]", 1500],
        ];
      }
      return [];
    });

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        data: {
          q,
        },
      },
    });

    const result = await fetchActiveProjects();

    expect(q).toHaveBeenCalledTimes(1);
    const firstQuery = q.mock.calls[0]?.[0];
    expect(typeof firstQuery).toBe("string");
    expect(firstQuery).toContain(
      ":find ?page-title ?project-block-uid ?project-str (max ?interaction-time)",
    );
    expect(firstQuery).toContain('(clojure.string/starts-with? ?status-str "Status::")');
    expect(firstQuery).toContain(":block/children ?status-block");
    expect(firstQuery).toContain("[?project-block :block/children ?interaction-block]");
    expect(firstQuery).toContain("[?interaction-block :block/parents ?project-block]");
    expect(firstQuery).toContain("[?interaction-block :create/time ?interaction-time]");
    expect(firstQuery).toContain("[?interaction-block :block/refs ?project-block]");
    expect(result).toEqual([
      { title: "Scale [[Acme/Fulfillment]] to different locations", uid: "uid-scale" },
      { title: "[[Project Alpha]]", uid: "uid-open" },
    ]);
  });

  it("falls back to legacy status workflow query when recency query is empty", async () => {
    const q = vi.fn((query: string, ..._inputs: Array<string>) => {
      if (
        query.includes(":find ?page-title ?project-block-uid ?project-str (max ?interaction-time)")
      ) {
        return [];
      }
      if (query.includes(":find ?page-title ?project-block-uid ?project-str")) {
        return [["Project Alpha", "uid-open", "Project:: [[Project Alpha]]"]];
      }
      return [];
    });

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        data: {
          q,
        },
      },
    });

    const result = await fetchActiveProjects();

    expect(q).toHaveBeenCalledTimes(2);
    expect(result).toEqual([{ title: "[[Project Alpha]]", uid: "uid-open" }]);
  });
});

describe("fetchAllProjects", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns historical projects ordered by latest interaction", async () => {
    const q = vi.fn((query: string, ..._inputs: Array<string>) => {
      if (
        query.includes(":find ?page-title ?project-block-uid ?project-str (max ?interaction-time)")
      ) {
        return [
          ["March 1st, 2026", "uid-closed", "Project:: [[Closed Project]] [[✅]]", 1000],
          ["March 4th, 2026", "uid-someday", "Project:: [[Someday Project]] #[[someday]]", 2000],
        ];
      }
      return [];
    });

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        data: {
          q,
        },
      },
    });

    const result = await fetchAllProjects();

    expect(q).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { title: "[[Someday Project]] #[[someday]]", uid: "uid-someday" },
      { title: "[[Closed Project]] [[✅]]", uid: "uid-closed" },
    ]);
  });
});

describe("teleportBlockToProject", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("moves block under existing Todo List:: child of project block", async () => {
    const q = vi.fn((query: string, ...inputs: Array<string>) => {
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        if (inputs[0] === "project-block-uid") {
          return [
            ["status-uid", "Status:: #ON_TRACK", 0],
            ["todo-list-uid", "Todo List::", 1],
          ];
        }
      }
      return [];
    });
    const createBlock = vi.fn(async () => undefined);
    const moveBlock = vi.fn(async () => undefined);
    const pull = vi.fn(() => ({
      ":block/parents": [{ ":block/uid": "triage-parent" }],
      ":block/uid": "todo-1",
    }));

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { pull, q },
        moveBlock,
        util: { generateUID: vi.fn() },
      },
    });

    await teleportBlockToProject("todo-1", "project-block-uid");

    expect(moveBlock).toHaveBeenCalledWith({
      block: { uid: "todo-1" },
      location: { order: "last", "parent-uid": "todo-list-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((todo-1))" },
      location: { order: "last", "parent-uid": "triage-parent" },
    });
  });

  it("creates Todo List:: child when missing and then moves block there", async () => {
    const q = vi.fn((query: string, ...inputs: Array<string>) => {
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        if (inputs[0] === "project-block-uid") {
          return [["status-uid", "Status:: #ON_TRACK", 0]];
        }
      }
      return [];
    });
    const createBlock = vi.fn(async () => undefined);
    const moveBlock = vi.fn(async () => undefined);
    const pull = vi.fn(() => ({
      ":block/parents": [{ ":block/uid": "triage-parent" }],
      ":block/uid": "todo-1",
    }));
    const generateUID = vi.fn().mockReturnValueOnce("new-todo-list-uid");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { pull, q },
        moveBlock,
        util: { generateUID },
      },
    });

    await teleportBlockToProject("todo-1", "project-block-uid");

    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "Todo List::", uid: "new-todo-list-uid" },
      location: { order: "last", "parent-uid": "project-block-uid" },
    });
    expect(moveBlock).toHaveBeenCalledWith({
      block: { uid: "todo-1" },
      location: { order: "last", "parent-uid": "new-todo-list-uid" },
    });
  });
});

describe("reactivateProjectStatusIfInactive", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("updates an inactive status block back to #ON_TRACK", async () => {
    const q = vi.fn((query: string, ...inputs: Array<string>) => {
      if (query.includes(":find ?child-uid ?child-string ?order") && inputs[0] === "project-uid") {
        return [["status-uid", "Status:: #someday", 0]];
      }
      return [];
    });
    const pull = vi.fn(() => ({ ":block/string": "Project:: [[Alpha]]" }));
    const updateBlock = vi.fn(async () => undefined);
    const createBlock = vi.fn(async () => undefined);

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { pull, q },
        updateBlock,
        util: { generateUID: vi.fn(() => "new-status-uid") },
      },
    });

    const changed = await reactivateProjectStatusIfInactive("project-uid");

    expect(changed).toBe(true);
    expect(updateBlock).toHaveBeenCalledWith({
      block: { string: "Status:: #ON_TRACK", uid: "status-uid" },
    });
    expect(createBlock).not.toHaveBeenCalled();
  });

  it("creates a missing status block when the project string itself is inactive", async () => {
    const q = vi.fn((query: string, ...inputs: Array<string>) => {
      if (query.includes(":find ?child-uid ?child-string ?order") && inputs[0] === "project-uid") {
        return [];
      }
      return [];
    });
    const pull = vi.fn(() => ({ ":block/string": "Project:: [[Beta]] #[[someday]]" }));
    const updateBlock = vi.fn(async () => undefined);
    const createBlock = vi.fn(async () => undefined);

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { pull, q },
        updateBlock,
        util: { generateUID: vi.fn(() => "new-status-uid") },
      },
    });

    const changed = await reactivateProjectStatusIfInactive("project-uid");

    expect(changed).toBe(true);
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "Status:: #ON_TRACK", uid: "new-status-uid" },
      location: { order: "last", "parent-uid": "project-uid" },
    });
  });

  it("strips inline inactive markers when reactivating a project", async () => {
    const q = vi.fn((query: string, ...inputs: Array<string>) => {
      if (query.includes(":find ?child-uid ?child-string ?order") && inputs[0] === "project-uid") {
        return [["status-uid", "Status:: [[✅]]", 0]];
      }
      return [];
    });
    const pull = vi.fn(() => ({ ":block/string": "Project:: [[Ship it]] [[✅]]" }));
    const updateBlock = vi.fn(async () => undefined);
    const createBlock = vi.fn(async () => undefined);

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { pull, q },
        updateBlock,
        util: { generateUID: vi.fn(() => "new-status-uid") },
      },
    });

    const changed = await reactivateProjectStatusIfInactive("project-uid");

    expect(changed).toBe(true);
    expect(updateBlock).toHaveBeenNthCalledWith(1, {
      block: { string: "Project:: [[Ship it]]", uid: "project-uid" },
    });
    expect(updateBlock).toHaveBeenNthCalledWith(2, {
      block: { string: "Status:: #ON_TRACK", uid: "status-uid" },
    });
    expect(createBlock).not.toHaveBeenCalled();
  });

  it("leaves already-active projects unchanged", async () => {
    const q = vi.fn((query: string, ...inputs: Array<string>) => {
      if (query.includes(":find ?child-uid ?child-string ?order") && inputs[0] === "project-uid") {
        return [["status-uid", "Status:: #ON_TRACK", 0]];
      }
      return [];
    });
    const pull = vi.fn(() => ({ ":block/string": "Project:: [[Gamma]]" }));
    const updateBlock = vi.fn(async () => undefined);
    const createBlock = vi.fn(async () => undefined);

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { pull, q },
        updateBlock,
        util: { generateUID: vi.fn(() => "new-status-uid") },
      },
    });

    const changed = await reactivateProjectStatusIfInactive("project-uid");

    expect(changed).toBe(false);
    expect(updateBlock).not.toHaveBeenCalled();
    expect(createBlock).not.toHaveBeenCalled();
  });
});

describe("teleportBlockToWorkflowLocation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("moves todo onto workflow page under Todo List:: and location bucket", async () => {
    const q = vi.fn((query: string, ...inputs: Array<string>) => {
      if (query.includes(":node/title ?title") && query.includes(":find ?uid")) {
        if (inputs[0] === "up") {
          return [["up-page-uid"]];
        }
        return [];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        if (inputs[0] === "up-page-uid") {
          return [["todo-list-uid", "Todo List::", 0]];
        }
        if (inputs[0] === "todo-list-uid") {
          return [["home-uid", "#[[Home]]", 0]];
        }
        return [];
      }
      return [];
    });
    const createBlock = vi.fn(async () => undefined);
    const moveBlock = vi.fn(async () => undefined);
    const pull = vi.fn(() => ({
      ":block/parents": [{ ":block/uid": "triage-parent" }],
      ":block/uid": "todo-1",
    }));

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { pull, q },
        moveBlock,
        util: { generateUID: vi.fn() },
      },
    });

    await teleportBlockToWorkflowLocation("todo-1", "up", "Home");

    expect(moveBlock).toHaveBeenCalledWith({
      block: { uid: "todo-1" },
      location: { order: "last", "parent-uid": "home-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((todo-1))" },
      location: { order: "last", "parent-uid": "triage-parent" },
    });
  });
});

describe("createProjectFromTemplateAndTeleportTodo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates project on today's DNP from template and moves todo under Todo List::", async () => {
    const today = formatRoamDate(new Date());
    const q = vi.fn((query: string, ...inputs: Array<string>) => {
      if (query.includes(":node/title ?title") && query.includes(":find ?uid")) {
        return inputs[0] === today ? [["daily-uid"]] : [];
      }
      if (query.includes(':node/title "roam/templates"')) {
        return [["template-project", "project", 0]];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        const parentUid = inputs[0];
        if (parentUid === "template-project") {
          return [["template-wrapper", "Project::", 0]];
        }
        if (parentUid === "template-wrapper") {
          return [
            ["template-status", "Status:: #ON_TRACK", 0],
            ["template-todo", "Todo List::", 1],
          ];
        }
        if (parentUid === "template-todo") {
          return [["template-notes", "Notes::", 0]];
        }
        return [];
      }
      return [];
    });
    const createBlock = vi.fn(async () => undefined);
    const createPage = vi.fn(async () => undefined);
    const moveBlock = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async () => undefined);
    const pull = vi.fn(() => ({
      ":block/parents": [{ ":block/uid": "triage-parent" }],
      ":block/uid": "todo-1",
    }));
    const generateUID = vi
      .fn()
      .mockReturnValueOnce("new-project-uid")
      .mockReturnValueOnce("new-status-uid")
      .mockReturnValueOnce("new-todo-list-uid")
      .mockReturnValueOnce("new-notes-uid");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        createPage,
        data: { pull, q },
        moveBlock,
        updateBlock,
        util: { generateUID },
      },
    });

    const result = await createProjectFromTemplateAndTeleportTodo("todo-1", "Apple Pie");

    expect(createPage).not.toHaveBeenCalled();
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "Project:: Apple Pie", uid: "new-project-uid" },
      location: { order: "last", "parent-uid": "daily-uid" },
    });
    expect(createBlock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        block: expect.objectContaining({ string: "Project::" }),
      }),
    );
    expect(moveBlock).toHaveBeenCalledWith({
      block: { uid: "todo-1" },
      location: { order: "last", "parent-uid": "new-todo-list-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((todo-1))" },
      location: { order: "last", "parent-uid": "triage-parent" },
    });
    expect(updateBlock).toHaveBeenCalledWith({
      block: { open: false, uid: "new-project-uid" },
    });
    expect(result).toEqual({ projectUid: "new-project-uid", todoListUid: "new-todo-list-uid" });
  });

  it("keeps namespaced page refs when creating a new project from Step 1 input", async () => {
    const today = formatRoamDate(new Date());
    const q = vi.fn((query: string, ...inputs: Array<string>) => {
      if (query.includes(":node/title ?title") && query.includes(":find ?uid")) {
        return inputs[0] === today ? [["daily-uid"]] : [];
      }
      if (query.includes(':node/title "roam/templates"')) {
        return [["template-project", "project", 0]];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        const parentUid = inputs[0];
        if (parentUid === "template-project") {
          return [["template-wrapper", "Project::", 0]];
        }
        if (parentUid === "template-wrapper") {
          return [
            ["template-status", "Status:: #ON_TRACK", 0],
            ["template-todo", "Todo List::", 1],
          ];
        }
        return [];
      }
      return [];
    });
    const createBlock = vi.fn(async () => undefined);
    const createPage = vi.fn(async () => undefined);
    const moveBlock = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async () => undefined);
    const pull = vi.fn(() => ({
      ":block/parents": [{ ":block/uid": "triage-parent" }],
      ":block/uid": "todo-1",
    }));
    const generateUID = vi
      .fn()
      .mockReturnValueOnce("new-project-uid")
      .mockReturnValueOnce("new-status-uid")
      .mockReturnValueOnce("new-todo-list-uid");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        createPage,
        data: { pull, q },
        moveBlock,
        updateBlock,
        util: { generateUID },
      },
    });

    await createProjectFromTemplateAndTeleportTodo("todo-1", "[[ExampleCorp/My New Project]]");

    expect(createPage).not.toHaveBeenCalled();
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "Project:: [[ExampleCorp/My New Project]]", uid: "new-project-uid" },
      location: { order: "last", "parent-uid": "daily-uid" },
    });
    expect(moveBlock).toHaveBeenCalledWith({
      block: { uid: "todo-1" },
      location: { order: "last", "parent-uid": "new-todo-list-uid" },
    });
  });

  it("falls back to creating Todo List:: when template is missing", async () => {
    const today = formatRoamDate(new Date());
    const q = vi.fn((query: string, ..._inputs: Array<string>) => {
      if (query.includes(":node/title ?title") && query.includes(":find ?uid")) {
        return [];
      }
      if (query.includes(':node/title "roam/templates"')) {
        return [];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        return [];
      }
      return [];
    });
    const createBlock = vi.fn(async () => undefined);
    const createPage = vi.fn(async () => undefined);
    const moveBlock = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async () => undefined);
    const pull = vi.fn(() => ({
      ":block/parents": [{ ":block/uid": "triage-parent" }],
      ":block/uid": "todo-1",
    }));
    const generateUID = vi
      .fn()
      .mockReturnValueOnce("new-daily-uid")
      .mockReturnValueOnce("new-project-uid")
      .mockReturnValueOnce("new-todo-list-uid");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        createPage,
        data: { pull, q },
        moveBlock,
        updateBlock,
        util: { generateUID },
      },
    });

    const result = await createProjectFromTemplateAndTeleportTodo("todo-1", "Apple Pie");

    expect(createPage).toHaveBeenCalledWith({
      page: { title: today, uid: "new-daily-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "Project:: Apple Pie", uid: "new-project-uid" },
      location: { order: "last", "parent-uid": "new-daily-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "Todo List::", uid: "new-todo-list-uid" },
      location: { order: "last", "parent-uid": "new-project-uid" },
    });
    expect(moveBlock).toHaveBeenCalledWith({
      block: { uid: "todo-1" },
      location: { order: "last", "parent-uid": "new-todo-list-uid" },
    });
    expect(updateBlock).toHaveBeenCalledWith({
      block: { open: false, uid: "new-project-uid" },
    });
    expect(result).toEqual({ projectUid: "new-project-uid", todoListUid: "new-todo-list-uid" });
  });
});
