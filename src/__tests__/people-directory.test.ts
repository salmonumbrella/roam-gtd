import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cloneChildrenFromTemplate: vi.fn(async () => undefined),
  executeQuery: vi.fn(),
  runRoamQuery: vi.fn(),
}));

vi.mock("../data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data")>();
  return {
    ...actual,
    executeQuery: mocks.executeQuery,
    runRoamQuery: mocks.runRoamQuery,
  };
});

vi.mock("../graph-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../graph-utils")>();
  return {
    ...actual,
    cloneChildrenFromTemplate: mocks.cloneChildrenFromTemplate,
  };
});

import {
  fetchAllPeople,
  getOrCreatePersonPage,
  pageHasTag,
  resetPeopleCache,
} from "../people/directory";

describe("people directory helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPeopleCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("caches people fetches by normalized delegate target set", async () => {
    mocks.executeQuery.mockResolvedValue([["Alice", "alice-uid", 1000]]);

    const first = await fetchAllPeople(["people", "agents"]);
    const second = await fetchAllPeople(["agents", "people"]);

    expect(first).toEqual([{ lastInteractionTime: 1000, title: "Alice", uid: "alice-uid" }]);
    expect(second).toEqual(first);
    expect(mocks.executeQuery).toHaveBeenCalledTimes(1);
  });

  it("matches page tags across normalized title candidates", () => {
    mocks.runRoamQuery.mockReturnValue([["tag-block-uid"]]);

    expect(pageHasTag("page-uid", "#[[agents]]")).toBe(true);
    expect(mocks.runRoamQuery).toHaveBeenCalledWith(expect.any(String), "page-uid", [
      "agents",
      "Agents",
    ]);
  });

  it("creates a person page and clones the matching template", async () => {
    mocks.runRoamQuery.mockImplementation((query: string) => {
      if (query.includes(":find ?uid ?s ?order")) {
        return [["template-uid", "people", 0]];
      }
      return [];
    });
    const createPage = vi.fn(async () => undefined);
    vi.stubGlobal("window", {
      roamAlphaAPI: {
        createPage,
        util: { generateUID: vi.fn(() => "new-page-uid") },
      },
    });

    const person = await getOrCreatePersonPage("Alice", ["people", "agents"]);

    expect(person).toEqual({ title: "Alice", uid: "new-page-uid" });
    expect(createPage).toHaveBeenCalledWith({
      page: { title: "Alice", uid: "new-page-uid" },
    });
    expect(mocks.cloneChildrenFromTemplate).toHaveBeenCalledWith("template-uid", "new-page-uid");
  });
});
