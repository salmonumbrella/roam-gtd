import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PersonEntry } from "../people";
import type { ProjectOption } from "../triage/support";
import { TEST_SETTINGS } from "./fixtures";
import {
  createWorkflowTriageHarness,
  createWorkflowTriageTodo,
  resetDelegatedPersonRefsCache,
  seedDelegatedPersonRefsCache,
} from "./helpers/review-wizard-workflow-triage-harness";

type DelegatedRefRow = readonly [string, string, string];

function delegatedRefRows(...rows: Array<DelegatedRefRow>): Array<DelegatedRefRow> {
  return rows;
}

const mocks = vi.hoisted(() => ({
  executeRawQuery: vi.fn<
    (query: string, ...inputs: Array<unknown>) => Promise<Array<DelegatedRefRow>>
  >(async () => []),
  fetchAllPeople: vi.fn<(delegateTargetTags: Array<string>) => Promise<Array<PersonEntry>>>(
    async () => [],
  ),
  loadTriageProjects: vi.fn<
    (args?: {
      onUpdate?: (projects: Array<ProjectOption>) => void;
    }) => Promise<Array<ProjectOption>>
  >(async ({ onUpdate }: { onUpdate?: (projects: Array<ProjectOption>) => void } = {}) => {
    const projects: Array<ProjectOption> = [];
    onUpdate?.(projects);
    return projects;
  }),
  sortPeopleEntries: vi.fn<(entries: Array<PersonEntry>) => Array<PersonEntry>>(
    (entries: Array<PersonEntry>) => entries,
  ),
}));

vi.mock("../data", async () => {
  const actual = await vi.importActual<typeof import("../data")>("../data");
  return {
    ...actual,
    executeRawQuery: mocks.executeRawQuery,
  };
});

vi.mock("../people", async () => {
  const actual = await vi.importActual<typeof import("../people")>("../people");
  return {
    ...actual,
    fetchAllPeople: mocks.fetchAllPeople,
    sortPeopleEntries: mocks.sortPeopleEntries,
  };
});

vi.mock("../triage/support", async () => {
  const actual = await vi.importActual<typeof import("../triage/support")>("../triage/support");
  return {
    ...actual,
    loadTriageProjects: mocks.loadTriageProjects,
  };
});

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function advanceTimers(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function runPendingAsyncWork(): Promise<void> {
  await act(async () => {
    await vi.runAllTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    reject,
    resolve,
  };
}

describe("useReviewWizardWorkflowTriage behavior", () => {
  let harness: ReturnType<typeof createWorkflowTriageHarness> | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    resetDelegatedPersonRefsCache();

    mocks.executeRawQuery.mockReset().mockResolvedValue([]);
    mocks.fetchAllPeople.mockReset().mockResolvedValue([]);
    mocks.loadTriageProjects
      .mockReset()
      .mockImplementation(
        async ({ onUpdate }: { onUpdate?: (projects: Array<ProjectOption>) => void } = {}) => {
          const projects: Array<ProjectOption> = [];
          onUpdate?.(projects);
          return projects;
        },
      );
    mocks.sortPeopleEntries
      .mockReset()
      .mockImplementation((entries: Array<PersonEntry>) => entries);
  });

  afterEach(() => {
    harness?.cleanup();
    harness = null;
    vi.useRealTimers();
  });

  it("stores the full active request and preserves it across harmless rerenders", async () => {
    const item = createWorkflowTriageTodo({ text: "Follow up", uid: "todo-request" });
    harness = createWorkflowTriageHarness({
      delegatedItems: [item],
      stepKey: "someday",
      visibleItems: [item],
    });

    await harness.render();

    const anchor = harness.createConnectedAnchor();
    const request = harness.createRequest({
      anchorElement: anchor.element,
      currentTag: TEST_SETTINGS.tagWaitingFor,
      item,
    });

    await harness.openWorkflowTriage(request);

    expect(harness.getActiveWorkflowTriage()).toEqual({
      anchorElement: anchor.element,
      currentTag: TEST_SETTINGS.tagWaitingFor,
      item,
    });
    expect(harness.getWorkflowTriagePosition()).toEqual({ left: 104, top: 144 });

    await harness.rerender({
      delegatedItems: [item],
      visibleItems: [createWorkflowTriageTodo({ text: "Follow up", uid: "todo-request" })],
    });

    expect(harness.getActiveWorkflowTriage()).toEqual({
      anchorElement: anchor.element,
      currentTag: TEST_SETTINGS.tagWaitingFor,
      item,
    });
  });

  it("toggles triage closed when the same request opens twice", async () => {
    const item = createWorkflowTriageTodo({ uid: "todo-toggle" });
    harness = createWorkflowTriageHarness({
      stepKey: "someday",
      visibleItems: [item],
    });

    await harness.render();

    const anchor = harness.createConnectedAnchor();
    const request = harness.createRequest({ anchorElement: anchor.element, item });

    await harness.openWorkflowTriage(request);
    expect(harness.getActiveWorkflowTriage()?.item.uid).toBe("todo-toggle");

    await harness.openWorkflowTriage(request);
    expect(harness.getActiveWorkflowTriage()).toBeNull();
  });

  it("clears an active triage when the visible item disappears", async () => {
    const item = createWorkflowTriageTodo({ uid: "todo-visible" });
    harness = createWorkflowTriageHarness({
      stepKey: "someday",
      visibleItems: [item],
    });

    await harness.render();

    const anchor = harness.createConnectedAnchor();
    await harness.openWorkflowTriage(
      harness.createRequest({ anchorElement: anchor.element, item }),
    );
    expect(harness.getActiveWorkflowTriage()?.item.uid).toBe("todo-visible");

    await harness.rerender({ visibleItems: [] });
    expect(harness.getActiveWorkflowTriage()).toBeNull();
  });

  it("recomputes the popover position on resize and scroll", async () => {
    const item = createWorkflowTriageTodo({ uid: "todo-position" });
    harness = createWorkflowTriageHarness({
      stepKey: "someday",
      visibleItems: [item],
    });

    await harness.render();

    const anchor = harness.createConnectedAnchor({ bottom: 160, right: 360 });
    await harness.openWorkflowTriage(
      harness.createRequest({ anchorElement: anchor.element, item }),
    );
    expect(harness.getWorkflowTriagePosition()).toEqual({ left: 104, top: 144 });

    anchor.setRect({ bottom: 210, right: 500 });
    await harness.dispatchWindowEvent("resize");
    expect(harness.getWorkflowTriagePosition()).toEqual({ left: 200, top: 194 });

    anchor.setRect({ bottom: 230, right: 410 });
    await harness.dispatchWindowEvent("scroll");
    expect(harness.getWorkflowTriagePosition()).toEqual({ left: 154, top: 214 });
  });

  it("closes triage when the anchor disconnects during repositioning", async () => {
    const item = createWorkflowTriageTodo({ uid: "todo-anchor" });
    harness = createWorkflowTriageHarness({
      stepKey: "someday",
      visibleItems: [item],
    });

    await harness.render();

    const anchor = harness.createConnectedAnchor();
    await harness.openWorkflowTriage(
      harness.createRequest({ anchorElement: anchor.element, item }),
    );
    expect(harness.getActiveWorkflowTriage()?.item.uid).toBe("todo-anchor");

    anchor.disconnect();
    await harness.dispatchWindowEvent("resize");
    expect(harness.getActiveWorkflowTriage()).toBeNull();
  });

  it("preloads triage people on open and retries after a failure", async () => {
    const people = [
      { title: "Charlie Example", uid: "person-3" },
      { title: "Alice Example", uid: "person-1" },
    ];
    mocks.fetchAllPeople.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(people);
    mocks.sortPeopleEntries.mockImplementation((entries: Array<PersonEntry>) =>
      [...entries].sort((left, right) => left.title.localeCompare(right.title)),
    );

    harness = createWorkflowTriageHarness({
      isOpen: true,
      stepKey: "waitingDelegated",
      visibleItems: [],
    });

    await harness.render();
    await flushEffects();

    expect(mocks.fetchAllPeople).toHaveBeenCalledTimes(1);
    expect(harness.getTriagePeople()).toEqual([]);

    await harness.rerender({ isOpen: false });
    await harness.rerender({ isOpen: true });
    await flushEffects();

    expect(mocks.fetchAllPeople).toHaveBeenCalledTimes(2);
    expect(harness.getTriagePeople()).toEqual([
      { title: "Alice Example", uid: "person-1" },
      { title: "Charlie Example", uid: "person-3" },
    ]);
  });

  it("preloads triage projects on open and retries after a failure", async () => {
    mocks.loadTriageProjects
      .mockImplementationOnce(async () => {
        throw new Error("boom");
      })
      .mockImplementationOnce(
        async ({ onUpdate }: { onUpdate?: (projects: Array<ProjectOption>) => void } = {}) => {
          const projects = [{ title: "Project Beta", uid: "project-2" }];
          onUpdate?.(projects);
          return projects;
        },
      );

    harness = createWorkflowTriageHarness({
      isOpen: true,
      stepKey: "waitingDelegated",
      visibleItems: [],
    });

    await harness.render();
    await flushEffects();

    expect(mocks.loadTriageProjects).toHaveBeenCalledTimes(1);
    expect(harness.getTriageProjects()).toEqual([]);

    await harness.rerender({ isOpen: false });
    await harness.rerender({ isOpen: true });
    await flushEffects();

    expect(mocks.loadTriageProjects).toHaveBeenCalledTimes(2);
    expect(harness.getTriageProjects()).toEqual([{ title: "Project Beta", uid: "project-2" }]);
  });

  it("uses cached delegated refs without hitting the async query path", async () => {
    const item = createWorkflowTriageTodo({ uid: "todo-cached" });
    const settings = {
      ...TEST_SETTINGS,
      delegateTargetTags: ["people"],
    };

    seedDelegatedPersonRefsCache({
      delegateTargetTags: settings.delegateTargetTags,
      snapshot: {
        childPersonRefs: new Map([["todo-cached", ["Alice Example"]]]),
        people: [{ title: "Alice Example", uid: "person-1" }],
      },
      uids: [item.uid],
    });

    harness = createWorkflowTriageHarness({
      delegatedItems: [item],
      isOpen: true,
      settings,
      stepKey: "upcoming",
      visibleItems: [item],
    });

    await harness.render();
    await flushEffects();

    expect(mocks.executeRawQuery).not.toHaveBeenCalled();
    expect(harness.getDelegatedPeople()).toEqual([{ title: "Alice Example", uid: "person-1" }]);
    expect(harness.getDelegatedChildPersonRefs().get("todo-cached")).toEqual(["Alice Example"]);
  });

  it("delays delegated-ref prefetch for the upcoming step", async () => {
    const item = createWorkflowTriageTodo({ uid: "todo-upcoming" });
    const settings = {
      ...TEST_SETTINGS,
      delegateTargetTags: ["people"],
    };
    mocks.executeRawQuery.mockResolvedValueOnce(
      delegatedRefRows(["todo-upcoming", "Alice Example", "person-1"]),
    );

    harness = createWorkflowTriageHarness({
      delegatedItems: [item],
      isOpen: true,
      settings,
      stepKey: "upcoming",
      visibleItems: [item],
    });

    await harness.render();
    await flushEffects();

    expect(mocks.executeRawQuery).not.toHaveBeenCalled();

    await advanceTimers(149);
    expect(mocks.executeRawQuery).not.toHaveBeenCalled();
    expect(harness.getDelegatedPeople()).toEqual([]);

    await advanceTimers(1);

    expect(mocks.executeRawQuery).toHaveBeenCalledTimes(1);
    expect(harness.getDelegatedPeople()).toEqual([{ title: "Alice Example", uid: "person-1" }]);
    expect(harness.getDelegatedChildPersonRefs().get("todo-upcoming")).toEqual(["Alice Example"]);
  });

  it("prefetches delegated refs immediately for the waiting-delegated step", async () => {
    const item = createWorkflowTriageTodo({ uid: "todo-waiting" });
    const settings = {
      ...TEST_SETTINGS,
      delegateTargetTags: ["people"],
    };
    mocks.executeRawQuery.mockResolvedValueOnce(
      delegatedRefRows(["todo-waiting", "Alice Example", "person-1"]),
    );

    harness = createWorkflowTriageHarness({
      delegatedItems: [item],
      isOpen: true,
      settings,
      stepKey: "waitingDelegated",
      visibleItems: [item],
    });

    await harness.render();
    await runPendingAsyncWork();

    expect(mocks.executeRawQuery).toHaveBeenCalledTimes(1);
    expect(harness.getDelegatedPeople()).toEqual([{ title: "Alice Example", uid: "person-1" }]);
    expect(harness.getDelegatedChildPersonRefs().get("todo-waiting")).toEqual(["Alice Example"]);
  });

  it.each([
    {
      delegatedItems: [createWorkflowTriageTodo({ uid: "todo-someday" })],
      label: "the step is not upcoming or waiting delegated",
      settings: { ...TEST_SETTINGS, delegateTargetTags: ["people"] },
      stepKey: "someday" as const,
    },
    {
      delegatedItems: [createWorkflowTriageTodo({ uid: "todo-no-tags" })],
      label: "delegate target tags are empty",
      settings: { ...TEST_SETTINGS, delegateTargetTags: [] },
      stepKey: "upcoming" as const,
    },
    {
      delegatedItems: [],
      label: "there are no delegated items",
      settings: { ...TEST_SETTINGS, delegateTargetTags: ["people"] },
      stepKey: "upcoming" as const,
    },
  ])(
    "keeps delegated-ref prefetch off when $label",
    async ({ delegatedItems, settings, stepKey }) => {
      harness = createWorkflowTriageHarness({
        delegatedItems,
        isOpen: true,
        settings,
        stepKey,
        visibleItems: delegatedItems,
      });

      await harness.render();
      await runPendingAsyncWork();

      expect(mocks.executeRawQuery).not.toHaveBeenCalled();
      expect(harness.getDelegatedPeople()).toEqual([]);
    },
  );

  it("fails closed on delegated-ref query failure and retries after reopen", async () => {
    const item = createWorkflowTriageTodo({ uid: "todo-delegated-1" });
    const settings = {
      ...TEST_SETTINGS,
      delegateTargetTags: ["people"],
    };

    mocks.executeRawQuery.mockRejectedValueOnce(new Error("boom"));
    mocks.executeRawQuery.mockResolvedValueOnce(
      delegatedRefRows(["todo-delegated-1", "Alice", "person-1"]),
    );

    harness = createWorkflowTriageHarness({
      delegatedItems: [item],
      isOpen: true,
      settings,
      stepKey: "waitingDelegated",
      visibleItems: [item],
    });

    await harness.render();
    await runPendingAsyncWork();

    expect(harness.getDelegatedPeople()).toEqual([]);

    await harness.rerender({ isOpen: false });
    await harness.rerender({ isOpen: true });
    await runPendingAsyncWork();

    expect(mocks.executeRawQuery).toHaveBeenCalledTimes(2);
    expect(harness.getDelegatedPeople()).toEqual([{ title: "Alice", uid: "person-1" }]);
    expect(harness.getDelegatedChildPersonRefs().get("todo-delegated-1")).toEqual(["Alice"]);
  });

  it("cancels late delegated-ref results after the hook closes", async () => {
    const item = createWorkflowTriageTodo({ uid: "todo-late" });
    const settings = {
      ...TEST_SETTINGS,
      delegateTargetTags: ["people"],
    };
    const pendingQuery = createDeferred<Array<DelegatedRefRow>>();
    mocks.executeRawQuery.mockReturnValueOnce(pendingQuery.promise);

    harness = createWorkflowTriageHarness({
      delegatedItems: [item],
      isOpen: true,
      settings,
      stepKey: "upcoming",
      visibleItems: [item],
    });

    await harness.render();
    await advanceTimers(150);

    expect(mocks.executeRawQuery).toHaveBeenCalledTimes(1);

    await harness.rerender({ isOpen: false });
    pendingQuery.resolve(delegatedRefRows(["todo-late", "Late Person", "person-late"]));
    await flushEffects();

    expect(harness.getDelegatedPeople()).toEqual([]);
    expect(harness.getDelegatedChildPersonRefs().size).toBe(0);
  });

  it("clears only the intended active triage state", async () => {
    const firstItem = createWorkflowTriageTodo({ uid: "todo-1" });
    const secondItem = createWorkflowTriageTodo({ text: "Second item", uid: "todo-2" });
    harness = createWorkflowTriageHarness({
      stepKey: "someday",
      visibleItems: [firstItem, secondItem],
    });

    await harness.render();

    const firstAnchor = harness.createConnectedAnchor();
    await harness.openWorkflowTriage(
      harness.createRequest({ anchorElement: firstAnchor.element, item: firstItem }),
    );
    expect(harness.getActiveWorkflowTriage()?.item.uid).toBe("todo-1");

    await harness.clearWorkflowTriageForUid("todo-missing");
    expect(harness.getActiveWorkflowTriage()?.item.uid).toBe("todo-1");

    await harness.clearWorkflowTriageForUid("todo-1");
    expect(harness.getActiveWorkflowTriage()).toBeNull();

    const secondAnchor = harness.createConnectedAnchor({ bottom: 190, right: 390 });
    await harness.openWorkflowTriage(
      harness.createRequest({ anchorElement: secondAnchor.element, item: secondItem }),
    );
    expect(harness.getActiveWorkflowTriage()?.item.uid).toBe("todo-2");

    await harness.closeWorkflowTriage();
    expect(harness.getActiveWorkflowTriage()).toBeNull();
  });
});
