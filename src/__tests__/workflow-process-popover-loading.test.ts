import { JSDOM } from "jsdom";
import React, { useLayoutEffect } from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PersonEntry } from "../people";
import { createTriageInputService } from "../review/session/triage-input-service";
import type { createGtdStore } from "../store";
import type { ProjectOption } from "../triage/support";
import { TEST_SETTINGS } from "./fixtures";

const mocks = vi.hoisted(() => ({
  fetchAllPeople: vi.fn(async (): Promise<Array<PersonEntry>> => []),
  loadContextPageOptions: vi.fn(async (): Promise<Array<string>> => []),
  loadTriageProjects: vi.fn(async (): Promise<Array<ProjectOption>> => []),
  sortPeopleEntries: vi.fn((entries: Array<PersonEntry>) => entries),
}));

vi.mock("../people", () => ({
  fetchAllPeople: mocks.fetchAllPeople,
  sortPeopleEntries: mocks.sortPeopleEntries,
}));

vi.mock("../triage/context-search", () => ({
  filterContextSearchOptions: (options: Array<string>, query: string) =>
    options.filter((option) => option.toLowerCase().includes(query.toLowerCase())),
  loadContextPageOptions: mocks.loadContextPageOptions,
  readCachedTriageOptions: (cache: Map<string, Array<string>>, key: string) =>
    cache.get(key) ?? null,
  writeCachedTriageOptions: (
    cache: Map<string, Array<string>>,
    key: string,
    options: Array<string>,
    limit: number,
  ) => {
    cache.set(key, options);
    if (cache.size > limit) {
      const first = cache.keys().next().value;
      if (typeof first === "string") {
        cache.delete(first);
      }
    }
  },
}));

vi.mock("../triage/support", () => ({
  buildProjectOptionLookup: (projects: Array<ProjectOption>) => {
    const lookup = new Map<string, ProjectOption>();
    for (const project of projects) {
      lookup.set(project.title.toLowerCase(), project);
      if (project.searchText) {
        lookup.set(project.searchText, project);
      }
    }
    return lookup;
  },
  buildProjectSearchTextLookup: (projects: Array<ProjectOption>) =>
    new Map(
      projects.map((project) => [
        project.title,
        [project.title.toLowerCase(), ...(project.searchText ? [project.searchText] : [])],
      ]),
    ),
  filterNamespacedPageOptions: (options: Array<string>) => options,
  filterProjectOptions: (options: Array<string>) => options,
  loadTriageProjects: mocks.loadTriageProjects,
}));

import { useWorkflowProcessPopoverLoading } from "../workflow-process-popover/loading";

type GtdStore = ReturnType<typeof createGtdStore>;

function createStore(snapshotOverrides: Record<string, unknown> = {}): GtdStore {
  return {
    dispose: vi.fn(),
    getSnapshot: vi.fn(() => ({
      backHalfHydrated: false,
      backHalfLoadedAt: null,
      completedThisWeek: [],
      deferred: [],
      delegated: [],
      inbox: [],
      lastWeekMetrics: null,
      loading: false,
      nextActions: [],
      projects: [],
      projectsHydrated: false,
      projectsLoadedAt: null,
      projectsLoading: false,
      someday: [],
      stale: [],
      ticklerItems: [],
      topGoals: [],
      triagedThisWeekCount: 0,
      waitingFor: [],
      workflowHydrated: false,
      ...snapshotOverrides,
    })),
    refresh: vi.fn(async () => undefined),
    scheduleRefresh: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  } as GtdStore;
}

function flush(): Promise<void> {
  return act(async () => {
    vi.runOnlyPendingTimers();
    await Promise.resolve();
  });
}

describe("useWorkflowProcessPopoverLoading", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    dom = new JSDOM("<div id='root'></div>");
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Node", dom.window.Node);
  });

  afterEach(() => {
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    vi.useRealTimers();
    vi.unstubAllGlobals();
    dom.window.close();
  });

  function renderHarness(props: {
    initialPeople?: Array<PersonEntry>;
    initialProjects?: Array<ProjectOption>;
    isOpen?: boolean;
    triageService?: ReturnType<typeof createTriageInputService>;
  }) {
    let current: ReturnType<typeof useWorkflowProcessPopoverLoading> | undefined;
    const setCurrent = (value: ReturnType<typeof useWorkflowProcessPopoverLoading>) => {
      current = value;
    };

    function Harness() {
      const value = useWorkflowProcessPopoverLoading({
        delegateTargetTags: ["People"],
        initialPeople: props.initialPeople,
        initialProjects: props.initialProjects,
        isOpen: props.isOpen ?? true,
        triageService: props.triageService,
      });
      useLayoutEffect(() => {
        setCurrent(value);
      }, [value]);
      return null;
    }

    act(() => {
      ReactDOM.render(React.createElement(Harness), root);
    });

    return {
      get current() {
        if (!current) {
          throw new Error("Missing hook state");
        }
        return current;
      },
    };
  }

  it("loads people only once when requested repeatedly", async () => {
    mocks.fetchAllPeople.mockResolvedValueOnce([{ title: "Alice", uid: "alice" }]);
    const harness = renderHarness({});

    act(() => {
      harness.current.requestPeopleLoad();
      harness.current.requestPeopleLoad();
    });
    await flush();

    expect(mocks.fetchAllPeople).toHaveBeenCalledTimes(1);
    expect(harness.current.people).toEqual([{ title: "Alice", uid: "alice" }]);
  });

  it("skips project loading when initial projects are provided", async () => {
    const harness = renderHarness({
      initialProjects: [{ title: "Project/Alpha", uid: "project-alpha" }],
    });

    act(() => {
      harness.current.requestProjectsLoad();
    });
    await flush();

    expect(mocks.loadTriageProjects).not.toHaveBeenCalled();
  });

  it("reuses cached context results for a case-insensitive repeat query", async () => {
    mocks.loadContextPageOptions.mockResolvedValueOnce(["Alpha/Project"]);
    const harness = renderHarness({});

    act(() => {
      harness.current.handleContextInput("Alpha");
    });
    await flush();

    act(() => {
      harness.current.handleContextInput("alpha");
      vi.runAllTimers();
    });
    await flush();

    expect(mocks.loadContextPageOptions).toHaveBeenCalledTimes(1);
    expect(harness.current.contextOptions).toEqual(["Alpha/Project"]);
  });

  it("selects the matching project from typed input", () => {
    const harness = renderHarness({
      initialProjects: [
        {
          searchText: "alpha",
          title: "Project/Alpha",
          uid: "project-alpha",
        },
      ],
    });

    act(() => {
      harness.current.handleProjectInput("alpha");
    });

    expect(harness.current.selectedProject).toEqual({
      searchText: "alpha",
      title: "Project/Alpha",
      uid: "project-alpha",
    });
  });

  it("reuses warmed provider data without reloading projects", async () => {
    const triageService = createTriageInputService({
      settings: TEST_SETTINGS,
      store: createStore(),
    });
    const ensureWarm = vi.spyOn(triageService, "ensureWarm");
    triageService.seed("people", [{ title: "Warm Person", uid: "warm-person" }]);
    triageService.seed("project", [
      {
        searchText: "warm project",
        title: "Warm Project",
        uid: "warm-project",
      },
    ]);

    const harness = renderHarness({
      triageService,
    });

    act(() => {
      harness.current.handleProjectInput("warm project");
      harness.current.requestProjectsLoad();
    });
    await flush();

    expect(harness.current.projectOptions).toEqual(["Warm Project"]);
    expect(harness.current.selectedProject).toEqual({
      searchText: "warm project",
      title: "Warm Project",
      uid: "warm-project",
    });
    expect(ensureWarm).toHaveBeenCalledWith("project");
    expect(mocks.loadTriageProjects).not.toHaveBeenCalled();
  });
});
