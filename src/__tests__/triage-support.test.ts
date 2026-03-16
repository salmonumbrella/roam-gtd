import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchActiveProjects: vi.fn(async (): Promise<Array<{ title: string; uid: string }>> => []),
  fetchAllProjects: vi.fn(async (): Promise<Array<{ title: string; uid: string }>> => []),
}));

vi.mock("../teleport", () => ({
  fetchActiveProjects: mocks.fetchActiveProjects,
  fetchAllProjects: mocks.fetchAllProjects,
}));

import {
  buildProjectOptionLookup,
  buildProjectSearchTextLookup,
  filterProjectOptions,
  invalidateTriageProjectsCache,
  loadTriageProjects,
  mergeProjectOptions,
} from "../triage/support";

describe("triage-support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateTriageProjectsCache();
  });

  it("merges project options into normalized searchable labels", () => {
    const projects = mergeProjectOptions(
      [
        {
          title:
            "Project:: Organize monthly [[Reports]] with [[Spreadsheets]] ([[work/Budget Tracker]])",
          uid: "project-1",
        },
      ],
      [
        {
          searchText: "Project:: [[Roam GTD]] (wire up agents)",
          title: "ignored",
          uid: "project-2",
        },
      ],
    );

    expect(projects).toEqual([
      {
        searchText: "organize monthly reports with spreadsheets budget tracker",
        title: "Organize monthly Reports with Spreadsheets Budget Tracker",
        uid: "project-1",
      },
      {
        searchText: "roam gtd (wire up agents)",
        title: "Roam GTD (wire up agents)",
        uid: "project-2",
      },
    ]);
  });

  it("shares project lookup and filtering behavior across triage surfaces", () => {
    const projects = mergeProjectOptions([
      { title: "Project:: [[Workspace/Alias]]", uid: "project-1" },
      { title: "Project:: Scale [[Acme/Fulfillment]]", uid: "project-2" },
    ]);

    const projectLookup = buildProjectOptionLookup(projects);
    const projectSearchTextLookup = buildProjectSearchTextLookup(projects);

    expect(projectLookup.get("alias")?.uid).toBe("project-1");
    expect(
      filterProjectOptions(
        projects.map((project) => project.title),
        "acme",
        projectSearchTextLookup,
      ),
    ).toEqual(["Scale Fulfillment"]);
  });

  it("loads triage projects progressively and reuses the cached result", async () => {
    mocks.fetchActiveProjects.mockResolvedValue([
      { title: "Project:: [[Alpha]]", uid: "project-1" },
    ]);
    mocks.fetchAllProjects.mockResolvedValue([
      { title: "Project:: [[Alpha]]", uid: "project-1" },
      { title: "Project:: [[Beta]]", uid: "project-2" },
    ]);

    const updates: Array<Array<string>> = [];
    const loadedProjects = await loadTriageProjects({
      onUpdate: (projects) => {
        updates.push(projects.map((project) => project.uid));
      },
    });

    expect(updates).toEqual([["project-1"], ["project-1", "project-2"]]);
    expect(loadedProjects.map((project) => project.uid)).toEqual(["project-1", "project-2"]);
    expect(mocks.fetchActiveProjects).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAllProjects).toHaveBeenCalledTimes(1);

    const cachedUpdates: Array<Array<string>> = [];
    const cachedProjects = await loadTriageProjects({
      onUpdate: (projects) => {
        cachedUpdates.push(projects.map((project) => project.uid));
      },
    });

    expect(cachedUpdates).toEqual([["project-1", "project-2"]]);
    expect(cachedProjects.map((project) => project.uid)).toEqual(["project-1", "project-2"]);
    expect(mocks.fetchActiveProjects).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAllProjects).toHaveBeenCalledTimes(1);
  });

  it("invalidates the cached triage project list after project mutations", async () => {
    mocks.fetchActiveProjects.mockResolvedValue([
      { title: "Project:: [[Alpha]]", uid: "project-1" },
    ]);
    mocks.fetchAllProjects.mockResolvedValue([{ title: "Project:: [[Alpha]]", uid: "project-1" }]);

    await loadTriageProjects();
    expect(mocks.fetchActiveProjects).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAllProjects).toHaveBeenCalledTimes(1);

    invalidateTriageProjectsCache();
    await loadTriageProjects();

    expect(mocks.fetchActiveProjects).toHaveBeenCalledTimes(2);
    expect(mocks.fetchAllProjects).toHaveBeenCalledTimes(2);
  });
});
