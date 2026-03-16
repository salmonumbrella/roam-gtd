import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PersonEntry } from "../people";
import type { createGtdStore } from "../store";
import { CONTEXT_SEARCH_MAX_RESULTS } from "../triage/form-helpers";
import type { ProjectOption } from "../triage/support";
import { TEST_SETTINGS } from "./fixtures";

type GtdStore = ReturnType<typeof createGtdStore>;

interface Deferred<T> {
  promise: Promise<T>;
  reject: (error?: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
}

const mocks = vi.hoisted(() => ({
  fetchAllPeople: vi.fn(async (): Promise<Array<PersonEntry>> => []),
  loadContextPageOptions: vi.fn(async (): Promise<Array<string>> => []),
  loadTriageProjects: vi.fn(async (): Promise<Array<ProjectOption>> => []),
  primePageTitleSearchSupport: vi.fn(async (): Promise<void> => undefined),
  sortPeopleEntries: vi.fn((entries: Array<PersonEntry>) => entries),
}));

vi.mock("../contexts", () => ({
  primePageTitleSearchSupport: mocks.primePageTitleSearchSupport,
}));

vi.mock("../people", () => ({
  fetchAllPeople: mocks.fetchAllPeople,
  sortPeopleEntries: mocks.sortPeopleEntries,
}));

vi.mock("../triage/context-search", async () => {
  const actual = await vi.importActual<typeof import("../triage/context-search")>(
    "../triage/context-search",
  );
  return {
    ...actual,
    loadContextPageOptions: mocks.loadContextPageOptions,
  };
});

vi.mock("../triage/support", async () => {
  const actual = await vi.importActual<typeof import("../triage/support")>("../triage/support");
  return {
    ...actual,
    loadTriageProjects: mocks.loadTriageProjects,
  };
});

import { createTriageInputService } from "../review/session/triage-input-service";

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

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

describe("createTriageInputService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchAllPeople.mockResolvedValue([]);
    mocks.loadContextPageOptions.mockResolvedValue([]);
    mocks.loadTriageProjects.mockResolvedValue([]);
    mocks.primePageTitleSearchSupport.mockResolvedValue(undefined);
    mocks.sortPeopleEntries.mockImplementation((entries: Array<PersonEntry>) => entries);
  });

  it("reuses one in-flight context warmup across consumers", async () => {
    const deferred = createDeferred<void>();
    mocks.primePageTitleSearchSupport.mockReturnValueOnce(deferred.promise);
    const service = createTriageInputService({
      settings: TEST_SETTINGS,
      store: createStore(),
    });

    const first = service.ensureWarm("context");
    const second = service.ensureWarm("context");

    expect(first).toBe(second);
    expect(service.getSnapshot("context").status).toBe("warming");
    expect(mocks.primePageTitleSearchSupport).toHaveBeenCalledTimes(1);

    deferred.resolve();
    await expect(first).resolves.toBeUndefined();
    expect(service.getSnapshot("context").status).toBe("ready");
  });

  it("reuses one in-flight context query load for identical queries", async () => {
    const deferred = createDeferred<Array<string>>();
    mocks.loadContextPageOptions.mockReturnValueOnce(deferred.promise);
    const service = createTriageInputService({
      settings: TEST_SETTINGS,
      store: createStore(),
    });

    const first = service.queryContextOptions("Alpha");
    const second = service.queryContextOptions("alpha");

    expect(first).toBe(second);
    expect(mocks.loadContextPageOptions).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot("context").status).toBe("warming");

    deferred.resolve(["Alpha/Project"]);
    await expect(first).resolves.toEqual(["Alpha/Project"]);
    expect(service.getSnapshot("context").options).toEqual(["Alpha/Project"]);
  });

  it("reuses one in-flight people warmup across consumers", async () => {
    const deferred = createDeferred<Array<PersonEntry>>();
    mocks.fetchAllPeople.mockReturnValueOnce(deferred.promise);
    mocks.sortPeopleEntries.mockImplementation((entries: Array<PersonEntry>) =>
      [...entries].reverse(),
    );
    const service = createTriageInputService({
      settings: TEST_SETTINGS,
      store: createStore(),
    });

    const first = service.ensureWarm("people");
    const second = service.ensureWarm("people");

    expect(first).toBe(second);
    expect(mocks.fetchAllPeople).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAllPeople).toHaveBeenCalledWith(TEST_SETTINGS.delegateTargetTags);

    deferred.resolve([
      { title: "Alice", uid: "alice" },
      { title: "Bob", uid: "bob" },
    ]);
    await expect(first).resolves.toBeUndefined();

    expect(service.getSnapshot("people").options).toEqual([
      { title: "Bob", uid: "bob" },
      { title: "Alice", uid: "alice" },
    ]);
  });

  it("reuses one in-flight project warmup across consumers", async () => {
    const deferred = createDeferred<Array<ProjectOption>>();
    mocks.loadTriageProjects.mockReturnValueOnce(deferred.promise);
    const service = createTriageInputService({
      settings: TEST_SETTINGS,
      store: createStore(),
    });

    const first = service.ensureWarm("project");
    const second = service.ensureWarm("project");

    expect(first).toBe(second);
    expect(service.getSnapshot("project").status).toBe("warming");
    expect(mocks.loadTriageProjects).toHaveBeenCalledTimes(1);

    deferred.resolve([{ title: "Project/Alpha", uid: "project-alpha" }]);
    await expect(first).resolves.toBeUndefined();
    expect(service.getSnapshot("project").options).toEqual([
      { title: "Project/Alpha", uid: "project-alpha" },
    ]);
  });

  it("keeps the last good snapshot after a refresh failure", async () => {
    const goodProjects = [{ title: "Project/Alpha", uid: "project-alpha" }];
    mocks.loadTriageProjects.mockResolvedValueOnce(goodProjects);
    const service = createTriageInputService({
      settings: TEST_SETTINGS,
      store: createStore(),
    });

    await service.ensureWarm("project");
    mocks.loadTriageProjects.mockRejectedValueOnce(new Error("boom"));

    await expect(service.retry("project")).rejects.toThrow("boom");

    const snapshot = service.getSnapshot("project");
    expect(snapshot.options).toEqual(goodProjects);
    expect(snapshot.status).toBe("error");
    expect(snapshot.error).toEqual(expect.objectContaining({ message: "boom" }));
    expect(snapshot.data.lookup.get("project/alpha")).toEqual(goodProjects[0]);
  });

  it("keeps the last good people snapshot after a refresh failure", async () => {
    const goodPeople = [{ title: "Alice", uid: "alice" }];
    mocks.fetchAllPeople.mockResolvedValueOnce(goodPeople);
    const service = createTriageInputService({
      settings: TEST_SETTINGS,
      store: createStore(),
    });

    await service.ensureWarm("people");
    mocks.fetchAllPeople.mockRejectedValueOnce(new Error("boom"));

    await expect(service.retry("people")).rejects.toThrow("boom");
    expect(service.getSnapshot("people")).toEqual({
      error: expect.objectContaining({ message: "boom" }),
      options: goodPeople,
      status: "error",
    });
  });

  it("stores context query results in a session-scoped cache", () => {
    const service = createTriageInputService({
      settings: TEST_SETTINGS,
      store: createStore(),
    });

    service.seed("context", {
      options: ["Alpha/Project"],
      query: "Alpha",
    });

    const snapshot = service.getSnapshot("context");
    expect(snapshot.options).toEqual(["Alpha/Project"]);
    expect(snapshot.data.cache.get("alpha")).toEqual(["Alpha/Project"]);
    expect(snapshot.data.lastQuery).toBe("Alpha");
  });

  it("reuses prefix-cached context options while refreshing the exact query", async () => {
    mocks.loadContextPageOptions.mockResolvedValueOnce(["Alpha/Project", "Alpha/Next"]);
    const service = createTriageInputService({
      settings: TEST_SETTINGS,
      store: createStore(),
    });

    service.seed("context", {
      options: ["Alpha/Project"],
      query: "Alpha",
    });

    expect(service.readContextOptions("alpha/p")).toBeNull();
    expect(service.readPrefixContextOptions("alpha/p")).toEqual(["Alpha/Project"]);

    await expect(service.queryContextOptions("alpha/p")).resolves.toEqual([
      "Alpha/Project",
      "Alpha/Next",
    ]);

    expect(mocks.loadContextPageOptions).toHaveBeenCalledWith(
      "alpha/p",
      CONTEXT_SEARCH_MAX_RESULTS,
    );
    expect(service.getSnapshot("context").data.cache.get("alpha/p")).toEqual([
      "Alpha/Project",
      "Alpha/Next",
    ]);
  });

  it("starts the shared context warmup when querying uncached options", async () => {
    mocks.loadContextPageOptions.mockResolvedValueOnce(["Alpha/Project"]);
    const service = createTriageInputService({
      settings: TEST_SETTINGS,
      store: createStore(),
    });

    await expect(service.queryContextOptions("Alpha")).resolves.toEqual(["Alpha/Project"]);

    expect(mocks.primePageTitleSearchSupport).toHaveBeenCalledTimes(1);
  });

  it("invalidates provider snapshots without disturbing other providers", async () => {
    const service = createTriageInputService({
      settings: TEST_SETTINGS,
      store: createStore(),
    });

    service.seed("people", [{ title: "Alice", uid: "alice" }]);
    service.seed("project", [{ title: "Project/Alpha", uid: "project-alpha" }]);

    service.invalidate("people");

    expect(service.getSnapshot("people")).toEqual({
      error: null,
      options: [],
      status: "cold",
    });
    expect(service.getSnapshot("project").options).toEqual([
      { title: "Project/Alpha", uid: "project-alpha" },
    ]);
  });

  it("notifies only the subscribers for the updated provider", () => {
    const service = createTriageInputService({
      settings: TEST_SETTINGS,
      store: createStore(),
    });
    const projectListener = vi.fn();
    const peopleListener = vi.fn();

    service.subscribe("project", projectListener);
    service.subscribe("people", peopleListener);
    service.seed("project", [{ title: "Project/Alpha", uid: "project-alpha" }]);

    expect(projectListener).toHaveBeenCalledTimes(1);
    expect(peopleListener).not.toHaveBeenCalled();
  });
});
