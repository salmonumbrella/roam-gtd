import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeQuery: vi.fn(),
}));

vi.mock("../data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data")>();
  return {
    ...actual,
    executeQuery: mocks.executeQuery,
  };
});

import {
  createAgendaReference,
  createAgendaTodo,
  fetchAllPeople,
  findOrCreateAgendaBlock,
  getOrCreatePersonPage,
  pageHasTag,
  resetPeopleCache,
  syncDelegatedAgendaEntry,
} from "../people";

describe("fetchAllPeople", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPeopleCache();
  });

  it("returns people sorted by latest interaction time when recency query succeeds", async () => {
    mocks.executeQuery.mockImplementation(async () => [
      ["Alice", "uid-a", 1000],
      ["Bob Chen", "uid-b", 5000],
      ["Charlie", "uid-c", 3000],
    ]);

    const people = await fetchAllPeople(["people", "agents"]);

    expect(people.map((person) => person.title)).toEqual(["Bob Chen", "Charlie", "Alice"]);
    expect(people.map((person) => person.lastInteractionTime)).toEqual([5000, 3000, 1000]);
    expect(mocks.executeQuery).toHaveBeenCalledTimes(1);
  });

  it("falls back to legacy people query when recency query returns no rows", async () => {
    let callCount = 0;
    mocks.executeQuery.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        return [];
      }
      return [
        ["Charlie", "uid-c"],
        ["Alice", "uid-a"],
      ];
    });

    const people = await fetchAllPeople(["people", "agents"]);

    expect(people.map((person) => person.title)).toEqual(["Alice", "Charlie"]);
    expect(mocks.executeQuery).toHaveBeenCalledTimes(2);
  });

  it("reuses cached results for the same delegate tag set", async () => {
    mocks.executeQuery.mockImplementation(async () => [
      ["Alice", "uid-a", 1000],
      ["Bob Chen", "uid-b", 5000],
    ]);

    const first = await fetchAllPeople(["people", "agents"]);
    const second = await fetchAllPeople(["agents", "people"]);

    expect(first.map((person) => person.title)).toEqual(["Bob Chen", "Alice"]);
    expect(second.map((person) => person.title)).toEqual(["Bob Chen", "Alice"]);
    expect(mocks.executeQuery).toHaveBeenCalledTimes(1);
  });
});

describe("findOrCreateAgendaBlock", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("handles person page titles containing double quotes via parameterized query", async () => {
    const titleWithQuotes = 'O\'Brien "The Third"';
    const q = vi.fn((_query: string, ...inputs: Array<string>) => {
      if (_query.includes("clojure.string/starts-with?")) {
        if (inputs[0] === titleWithQuotes) {
          return [["agenda-uid"]];
        }
      }
      return [];
    });
    vi.stubGlobal("window", {
      roamAlphaAPI: { data: { q } },
    });

    const result = await findOrCreateAgendaBlock(titleWithQuotes);
    expect(result).toBe("agenda-uid");
  });
});

describe("delegation graph writes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a single agenda embed ref", async () => {
    const q = vi.fn((query: string) => {
      if (query.includes("clojure.string/starts-with?")) {
        return [["agenda-uid"]];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        return [];
      }
      return [];
    });
    const createBlock = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async () => undefined);

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { q },
        updateBlock,
        util: { generateUID: vi.fn(() => "unused") },
      },
    });

    await createAgendaTodo("source-uid", "Jane Cooper");

    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((source-uid))" },
      location: { order: 0, "parent-uid": "agenda-uid" },
    });
    expect(updateBlock).not.toHaveBeenCalled();
  });

  it("does not create a duplicate agenda ref when an exact ref already exists", async () => {
    const q = vi.fn((query: string) => {
      if (query.includes("clojure.string/starts-with?")) {
        return [["agenda-uid"]];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        return [["existing-agenda-entry-uid", "((source-uid))", 0]];
      }
      return [];
    });
    const createBlock = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async () => undefined);

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { q },
        updateBlock,
        util: { generateUID: vi.fn(() => "unused") },
      },
    });

    await createAgendaTodo("source-uid", "Jane Cooper");

    expect(createBlock).not.toHaveBeenCalled();
    expect(updateBlock).not.toHaveBeenCalled();
  });

  it("does not create a duplicate agenda ref when an embed ref already exists", async () => {
    const q = vi.fn((query: string) => {
      if (query.includes("clojure.string/starts-with?")) {
        return [["agenda-uid"]];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        return [["existing-embed-entry-uid", "{{[[embed]]: ((((source-uid))))}}", 0]];
      }
      return [];
    });
    const createBlock = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async () => undefined);

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { q },
        updateBlock,
        util: { generateUID: vi.fn(() => "unused") },
      },
    });

    await createAgendaTodo("source-uid", "Jane Cooper");

    expect(createBlock).not.toHaveBeenCalled();
    expect(updateBlock).not.toHaveBeenCalled();
  });

  it("does not create a duplicate agenda ref when a legacy TODO ref exists", async () => {
    const q = vi.fn((query: string) => {
      if (query.includes("clojure.string/starts-with?")) {
        return [["agenda-uid"]];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        return [["legacy-agenda-entry-uid", "{{[[TODO]]}} ((source-uid))", 0]];
      }
      return [];
    });
    const createBlock = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async () => undefined);
    const generateUID = vi.fn(() => "agenda-todo-uid");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { q },
        updateBlock,
        util: { generateUID },
      },
    });

    await createAgendaTodo("source-uid", "Jane Cooper");

    expect(createBlock).not.toHaveBeenCalled();
    expect(updateBlock).not.toHaveBeenCalled();
  });

  it("does not create a duplicate agenda ref when a bracket-only legacy TODO ref exists", async () => {
    const q = vi.fn((query: string) => {
      if (query.includes("clojure.string/starts-with?")) {
        return [["agenda-uid"]];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        return [["legacy-agenda-entry-uid", "[[TODO]] ((source-uid))", 0]];
      }
      return [];
    });
    const createBlock = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async () => undefined);
    const generateUID = vi.fn(() => "agenda-todo-uid");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { q },
        updateBlock,
        util: { generateUID },
      },
    });

    await createAgendaTodo("source-uid", "Jane Cooper");

    expect(createBlock).not.toHaveBeenCalled();
    expect(updateBlock).not.toHaveBeenCalled();
  });

  it("still creates a ref when an existing note only mentions the source ref", async () => {
    const q = vi.fn((query: string) => {
      if (query.includes("clojure.string/starts-with?")) {
        return [["agenda-uid"]];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        return [["note-entry-uid", "FYI ((source-uid))", 0]];
      }
      return [];
    });
    const createBlock = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async () => undefined);
    const generateUID = vi.fn(() => "agenda-todo-uid");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { q },
        updateBlock,
        util: { generateUID },
      },
    });

    await createAgendaTodo("source-uid", "Jane Cooper");

    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((source-uid))" },
      location: { order: 0, "parent-uid": "agenda-uid" },
    });
    expect(updateBlock).not.toHaveBeenCalled();
  });

  it("creates a plain block ref for watch agenda entries", async () => {
    const q = vi.fn((query: string) => {
      if (query.includes("clojure.string/starts-with?")) {
        return [["agenda-uid"]];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        return [];
      }
      return [];
    });
    const createBlock = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async () => undefined);

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { q },
        updateBlock,
        util: { generateUID: vi.fn(() => "unused") },
      },
    });

    await createAgendaReference("source-uid", "Jane Cooper");

    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((source-uid))" },
      location: { order: 0, "parent-uid": "agenda-uid" },
    });
    expect(updateBlock).not.toHaveBeenCalled();
  });

  it("creates a plain agenda ref, nests the due child ref, and marks the parent side-view", async () => {
    const q = vi.fn((query: string, uid: string) => {
      if (query.includes("clojure.string/starts-with?")) {
        return [["agenda-uid"]];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        if (uid === "agenda-uid") {
          return [];
        }
        if (uid === "source-uid") {
          return [["due-child-uid", "Due:: [[March 9th, 2026]]", 0]];
        }
        if (uid === "agenda-parent-uid") {
          return [];
        }
      }
      if (query.includes(":find ?view-str")) {
        return [];
      }
      return [];
    });
    const createBlock = vi.fn(async () => undefined);
    const deleteBlock = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async () => undefined);
    const generateUID = vi
      .fn()
      .mockReturnValueOnce("agenda-parent-uid")
      .mockReturnValueOnce("agenda-due-ref-uid");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { q },
        deleteBlock,
        updateBlock,
        util: { generateUID },
      },
    });

    await syncDelegatedAgendaEntry("source-uid", "Jane Cooper");

    expect(createBlock).toHaveBeenNthCalledWith(1, {
      block: { string: "((source-uid))", uid: "agenda-parent-uid" },
      location: { order: 0, "parent-uid": "agenda-uid" },
    });
    expect(createBlock).toHaveBeenNthCalledWith(2, {
      block: { string: "((due-child-uid))", uid: "agenda-due-ref-uid" },
      location: { order: 0, "parent-uid": "agenda-parent-uid" },
    });
    expect(updateBlock).toHaveBeenCalledWith({
      block: { "block-view-type": "side", uid: "agenda-parent-uid" },
    });
    expect(deleteBlock).not.toHaveBeenCalled();
  });

  it("lazy-migrates a legacy embed to a plain ref and preserves the nested due-ref structure", async () => {
    const q = vi.fn((query: string, uid: string) => {
      if (query.includes("clojure.string/starts-with?")) {
        return [["agenda-uid"]];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        if (uid === "agenda-uid") {
          return [["legacy-entry-uid", "{{[[embed]]: ((((source-uid))))}}", 0]];
        }
        if (uid === "source-uid") {
          return [["due-child-uid", "Due:: [[March 9th, 2026]]", 0]];
        }
        if (uid === "legacy-entry-uid") {
          return [];
        }
      }
      if (query.includes(":find ?view-str")) {
        return [];
      }
      return [];
    });
    const createBlock = vi.fn(async () => undefined);
    const deleteBlock = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async () => undefined);
    const generateUID = vi.fn().mockReturnValueOnce("agenda-due-ref-uid");

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { q },
        deleteBlock,
        updateBlock,
        util: { generateUID },
      },
    });

    await syncDelegatedAgendaEntry("source-uid", "Jane Cooper");

    expect(updateBlock).toHaveBeenCalledWith({
      block: { string: "((source-uid))", uid: "legacy-entry-uid" },
    });
    expect(createBlock).toHaveBeenCalledWith({
      block: { string: "((due-child-uid))", uid: "agenda-due-ref-uid" },
      location: { order: 0, "parent-uid": "legacy-entry-uid" },
    });
    expect(updateBlock).toHaveBeenCalledWith({
      block: { "block-view-type": "side", uid: "legacy-entry-uid" },
    });
    expect(deleteBlock).not.toHaveBeenCalled();
  });

  it("removes stale nested due refs and reverts the agenda parent to outline when due is removed", async () => {
    const q = vi.fn((query: string, uid: string) => {
      if (query.includes("clojure.string/starts-with?")) {
        return [["agenda-uid"]];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        if (uid === "agenda-uid") {
          return [["agenda-parent-uid", "((source-uid))", 0]];
        }
        if (uid === "source-uid") {
          return [["former-due-child-uid", "#[[home]]", 0]];
        }
        if (uid === "agenda-parent-uid") {
          return [["nested-due-ref-uid", "((former-due-child-uid))", 0]];
        }
      }
      if (query.includes(":find ?view-str")) {
        if (uid === "agenda-parent-uid") {
          return [[":side"]];
        }
        return [];
      }
      return [];
    });
    const createBlock = vi.fn(async () => undefined);
    const deleteBlock = vi.fn(async () => undefined);
    const updateBlock = vi.fn(async () => undefined);

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        data: { q },
        deleteBlock,
        updateBlock,
        util: { generateUID: vi.fn(() => "unused") },
      },
    });

    await syncDelegatedAgendaEntry("source-uid", "Jane Cooper");

    expect(deleteBlock).toHaveBeenCalledWith({
      block: { uid: "nested-due-ref-uid" },
    });
    expect(updateBlock).toHaveBeenCalledWith({
      block: { "block-view-type": "outline", uid: "agenda-parent-uid" },
    });
    expect(createBlock).not.toHaveBeenCalled();
  });
});

describe("pageHasTag", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when a page has the requested tag reference", () => {
    const q = vi.fn((_query: string, pageUid: string, candidates: Array<string>) => {
      if (
        pageUid === "agent-page-uid" &&
        Array.isArray(candidates) &&
        candidates.includes("agents")
      ) {
        return [["tag-block-uid"]];
      }
      return [];
    });
    vi.stubGlobal("window", {
      roamAlphaAPI: {
        data: { q },
      },
    });

    expect(pageHasTag("agent-page-uid", "agents")).toBe(true);
  });

  it("normalizes hash and bracket tag forms", () => {
    const q = vi.fn((_query: string, pageUid: string, candidates: Array<string>) => {
      if (
        pageUid === "agent-page-uid" &&
        Array.isArray(candidates) &&
        candidates.includes("agents")
      ) {
        return [["tag-block-uid"]];
      }
      return [];
    });
    vi.stubGlobal("window", {
      roamAlphaAPI: {
        data: { q },
      },
    });

    expect(pageHasTag("agent-page-uid", "#[[agents]]")).toBe(true);
  });

  it("returns false when the page is not tagged", () => {
    const q = vi.fn(() => []);
    vi.stubGlobal("window", {
      roamAlphaAPI: {
        data: { q },
      },
    });

    expect(pageHasTag("person-page-uid", "agents")).toBe(false);
  });
});

describe("getOrCreatePersonPage template preference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPeopleCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers the first delegate target tag for template selection", async () => {
    const q = vi.fn((query: string, ...inputs: Array<string>) => {
      if (query.includes(":in $ ?title")) {
        return [];
      }
      if (query.includes(":find ?uid ?s ?order")) {
        return [
          ["agents-template-uid", "agents", 0],
          ["people-template-uid", "people", 1],
        ];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        const parentUid = inputs[0];
        if (parentUid === "people-template-uid") {
          return [];
        }
      }
      return [];
    });
    const createPage = vi.fn(async () => undefined);
    const createBlock = vi.fn(async () => undefined);

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        createPage,
        data: { q },
        util: { generateUID: vi.fn(() => "new-person-uid") },
      },
    });

    const person = await getOrCreatePersonPage("Alice", ["people", "agents"]);

    expect(person).toEqual({ title: "Alice", uid: "new-person-uid" });
    expect(createPage).toHaveBeenCalledWith({
      page: { title: "Alice", uid: "new-person-uid" },
    });
    expect(createBlock).not.toHaveBeenCalled();
    expect(
      q.mock.calls.some(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes(":find ?child-uid ?child-string ?order") &&
          call[1] === "people-template-uid",
      ),
    ).toBe(true);
    expect(
      q.mock.calls.some(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes(":find ?child-uid ?child-string ?order") &&
          call[1] === "agents-template-uid",
      ),
    ).toBe(false);
  });

  it("falls back to the next configured target when the first template is missing", async () => {
    const q = vi.fn((query: string, ...inputs: Array<string>) => {
      if (query.includes(":in $ ?title")) {
        return [];
      }
      if (query.includes(":find ?uid ?s ?order")) {
        return [["agents-template-uid", "agents", 0]];
      }
      if (query.includes(":find ?child-uid ?child-string ?order")) {
        const parentUid = inputs[0];
        if (parentUid === "agents-template-uid") {
          return [];
        }
      }
      return [];
    });
    const createPage = vi.fn(async () => undefined);
    const createBlock = vi.fn(async () => undefined);

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createBlock,
        createPage,
        data: { q },
        util: { generateUID: vi.fn(() => "new-person-uid") },
      },
    });

    await getOrCreatePersonPage("Alice", ["people", "agents"]);

    expect(
      q.mock.calls.some(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes(":find ?child-uid ?child-string ?order") &&
          call[1] === "agents-template-uid",
      ),
    ).toBe(true);
  });

  it("invalidates cached people results after creating a new person page", async () => {
    mocks.executeQuery.mockResolvedValueOnce([["Alice", "uid-a", 1000]]).mockResolvedValueOnce([
      ["Alice", "uid-a", 1000],
      ["Bob", "uid-b", 2000],
    ]);

    const q = vi.fn((query: string) => {
      if (query.includes(":in $ ?title")) {
        return [];
      }
      if (query.includes(":find ?uid ?s ?order")) {
        return [];
      }
      return [];
    });
    const createPage = vi.fn(async () => undefined);

    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createPage,
        data: { q },
        util: { generateUID: vi.fn(() => "uid-b") },
      },
    });

    const first = await fetchAllPeople(["people"]);
    expect(first.map((person) => person.title)).toEqual(["Alice"]);
    expect(mocks.executeQuery).toHaveBeenCalledTimes(1);

    await getOrCreatePersonPage("Bob", ["people"]);

    const second = await fetchAllPeople(["people"]);
    expect(second.map((person) => person.title)).toEqual(["Bob", "Alice"]);
    expect(mocks.executeQuery).toHaveBeenCalledTimes(2);
    expect(createPage).toHaveBeenCalledWith({
      page: { title: "Bob", uid: "uid-b" },
    });
  });
});
