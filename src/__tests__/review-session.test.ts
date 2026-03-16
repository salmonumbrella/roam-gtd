import { describe, expect, it, vi } from "vitest";

import {
  createInboxStepController,
  type InboxStepController,
} from "../review/controllers/inbox-step-controller";
import type { ProjectsStepController } from "../review/controllers/projects-step-controller";
import { createReviewSession } from "../review/session/create-review-session";
import type {
  ReviewControllerDomain,
  ReviewControllerSnapshot,
  ReviewSession,
  ReviewStepController,
} from "../review/session/types";
import type { WizardStepKey } from "../review/wizard-support";
import type { GtdSettings } from "../settings";
import type { createGtdStore } from "../store";
import { TEST_SETTINGS } from "./fixtures";

type GtdStore = ReturnType<typeof createGtdStore>;

interface Deferred<T> {
  promise: Promise<T>;
  reject: (error?: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
}

type ActivationPlan = "resolve" | Deferred<void> | Error;

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

function t(key: string): string {
  switch (key) {
    case "dailyReviewTitle":
      return "Daily Review";
    case "step1Desc":
      return "Process inbox";
    case "step1Title":
      return "Step 1: Inbox Zero";
    case "step2Desc":
      return "Review projects";
    case "step2Title":
      return "Step 2: Projects";
    case "step3Desc":
      return "Review next actions";
    case "step3Title":
      return "Step 3: Next Actions";
    case "step4Desc":
      return "Review waiting";
    case "step4Title":
      return "Step 4: Waiting For";
    case "step5Desc":
      return "Review someday";
    case "step5Title":
      return "Step 5: Someday";
    case "step6Desc":
      return "Review triggers";
    case "step6Title":
      return "Step 6: Trigger List";
    case "step7Desc":
      return "Review tickler";
    case "step7Title":
      return "Step 7: Tickler";
    case "step8Desc":
      return "Review summary";
    case "step8Title":
      return "Step 8: Summary";
    default:
      return key;
  }
}

function createControllerSnapshot(
  stepKey: WizardStepKey,
  overrides: Partial<ReviewControllerSnapshot> = {},
): ReviewControllerSnapshot {
  return {
    footer: {
      leftAction: null,
      rightAction: null,
    },
    header: {
      legendSegments: null,
      progressValue: 0.5,
      title: `snapshot:${stepKey}`,
    },
    stepSlot: {
      error: null,
      mode: "ready",
    },
    ...overrides,
  };
}

function createControllerHarness(domainKey: ReviewControllerDomain) {
  const listeners = new Set<() => void>();
  const activationPlans: Array<ActivationPlan> = [];
  const snapshots = new Map<WizardStepKey, ReviewControllerSnapshot>();

  const controller: ReviewStepController = {
    activate: vi.fn((stepKey: WizardStepKey) => {
      if (!snapshots.has(stepKey)) {
        snapshots.set(stepKey, createControllerSnapshot(stepKey));
      }
      const plan = activationPlans.shift() ?? "resolve";
      if (plan === "resolve") {
        return Promise.resolve();
      }
      if (plan instanceof Error) {
        return Promise.reject(plan);
      }
      return plan.promise;
    }),
    deactivate: vi.fn(),
    dispose: vi.fn(),
    domainKey,
    getSnapshot: vi.fn((stepKey: WizardStepKey) => {
      return snapshots.get(stepKey) ?? createControllerSnapshot(stepKey);
    }),
    publishSnapshot: vi.fn((stepKey: WizardStepKey, snapshot: ReviewControllerSnapshot) => {
      snapshots.set(stepKey, snapshot);
      for (const listener of listeners) {
        listener();
      }
    }),
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
  };

  return {
    controller,
    publishSnapshot(stepKey: WizardStepKey, snapshot: ReviewControllerSnapshot) {
      snapshots.set(stepKey, snapshot);
      for (const listener of listeners) {
        listener();
      }
    },
    queueFailure(error: Error) {
      activationPlans.push(error);
    },
    queuePending() {
      const deferred = createDeferred<void>();
      activationPlans.push(deferred);
      return deferred;
    },
    queueSuccess() {
      activationPlans.push("resolve");
    },
  };
}

function createHarnesses() {
  return {
    dashboard: createControllerHarness("dashboard"),
    inbox: createControllerHarness("inbox"),
    projects: createControllerHarness("projects"),
    tickler: createControllerHarness("tickler"),
    workflow: createControllerHarness("workflow"),
  };
}

function createSession(
  args: {
    controllerFactories?: Partial<Record<ReviewControllerDomain, () => ReviewStepController>>;
    mode?: "daily" | "weekly";
    now?: Date;
    persistedStepIndex?: number;
    settings?: GtdSettings;
    store?: GtdStore;
  } = {},
): {
  harnesses: ReturnType<typeof createHarnesses>;
  session: ReviewSession;
} {
  const harnesses = createHarnesses();
  const session = createReviewSession({
    controllerFactories: {
      dashboard: () => harnesses.dashboard.controller,
      inbox: () => harnesses.inbox.controller,
      projects: () => harnesses.projects.controller,
      tickler: () => harnesses.tickler.controller,
      workflow: () => harnesses.workflow.controller,
      ...args.controllerFactories,
    },
    mode: args.mode ?? "weekly",
    now: args.now,
    persistedStepIndex: args.persistedStepIndex,
    settings: args.settings ?? TEST_SETTINGS,
    store: args.store ?? createStore(),
    t,
  });

  return { harnesses, session };
}

describe("createReviewSession", () => {
  it("maps workflow steps to one shared controller domain without instantiating it", () => {
    const workflowFactory = vi.fn(() => createControllerHarness("workflow").controller);
    const { session } = createSession({
      controllerFactories: {
        workflow: workflowFactory,
      },
    });

    expect(session.getControllerDomainForStep("upcoming")).toBe("workflow");
    expect(session.getControllerDomainForStep("waitingDelegated")).toBe("workflow");
    expect(session.getControllerDomainForStep("someday")).toBe("workflow");
    expect(workflowFactory).not.toHaveBeenCalled();
  });

  it("drops tickler from the active step list when the date rule hides it", () => {
    const { session } = createSession({
      now: new Date("2026-03-20T12:00:00.000Z"),
    });

    expect(session.getSnapshot().steps.map((step) => step.key)).not.toContain("tickler");
  });

  it("clamps a persisted weekly step index when the active step list shrinks", () => {
    const { session } = createSession({
      now: new Date("2026-03-20T12:00:00.000Z"),
      persistedStepIndex: 6,
    });

    expect(session.getSnapshot().activeStepKey).toBe("stats");
  });

  it("keeps late activation results in the session cache without forcing inactive-step UI", async () => {
    const { harnesses, session } = createSession();
    const pendingProjects = harnesses.projects.queuePending();

    const activation = session.activate("projects");
    await session.activate("inbox");
    pendingProjects.resolve();
    await activation;

    expect(session.getSnapshot().controllerStates.projects.status).toBe("ready");
    expect(session.getSnapshot().activeStepKey).toBe("inbox");
  });

  it("re-emits controller subscribe updates through the session snapshot", async () => {
    const { harnesses, session } = createSession();

    await session.activate("upcoming");
    harnesses.workflow.publishSnapshot(
      "upcoming",
      createControllerSnapshot("upcoming", {
        header: {
          legendSegments: null,
          progressValue: 0.75,
          title: "Upcoming (2 left)",
        },
      }),
    );

    expect(session.getSnapshot().activeStep.stepSnapshot?.header.title).toBe("Upcoming (2 left)");
  });

  it("treats triggerList as a static step with no controller domain", () => {
    const { session } = createSession();

    expect(session.getControllerDomainForStep("triggerList")).toBeNull();
  });

  it("reuses the same in-flight activation promise for one controller domain", () => {
    const { harnesses, session } = createSession();
    const pendingProjects = harnesses.projects.queuePending();

    const first = session.activate("projects");
    const second = session.activate("projects");

    expect(first).toBe(second);
    pendingProjects.resolve();
    return first;
  });

  it("reuses one in-flight activation while switching among workflow steps", async () => {
    const { harnesses, session } = createSession();

    await session.activate("upcoming");
    harnesses.workflow.publishSnapshot(
      "upcoming",
      createControllerSnapshot("upcoming", {
        header: {
          legendSegments: null,
          progressValue: 0.25,
          title: "Upcoming",
        },
      }),
    );

    const pendingWorkflow = harnesses.workflow.queuePending();

    const first = session.activate("someday");
    const second = session.activate("waitingDelegated");
    const third = session.activate("someday");

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(session.getSnapshot().activeStepKey).toBe("someday");
    expect(session.getSnapshot().activeStep.stepSnapshot?.header.title).not.toBe("Upcoming");

    pendingWorkflow.resolve();
    await first;
  });

  it("cancels activation completion notifications after dispose", async () => {
    const { harnesses, session } = createSession();
    const pendingProjects = harnesses.projects.queuePending();

    const activation = session.activate("projects");
    session.dispose();
    pendingProjects.resolve();
    await activation;

    expect(session.getSnapshot().controllerStates.projects.status).not.toBe("ready");
  });

  it("deactivates the previous controller when switching active steps", async () => {
    const { session } = createSession();

    await session.activate("projects");
    const projectsController = session.getControllerForStep("projects");
    await session.activate("upcoming");

    expect(projectsController?.deactivate).toHaveBeenCalledWith("projects");
  });

  it("marks a domain as error when activation fails and allows retry", async () => {
    const { harnesses, session } = createSession();
    harnesses.projects.queueFailure(new Error("boom"));
    harnesses.projects.queueSuccess();

    await expect(session.activate("projects")).rejects.toThrow("boom");
    expect(session.getSnapshot().controllerStates.projects.status).toBe("error");
    expect(session.getSnapshot().activeStep.stepSnapshot?.stepSlot.mode).toBe("error");

    await expect(session.activate("projects")).resolves.toBeUndefined();
    expect(session.getSnapshot().controllerStates.projects.status).toBe("ready");
  });

  it("starts projects warmup before the inbox reaches the final handoff", async () => {
    const store = createStore();
    const session = createReviewSession({
      mode: "weekly",
      settings: TEST_SETTINGS,
      store,
      t,
    });

    await session.activate("inbox");
    vi.mocked(store.scheduleRefresh).mockClear();
    const inboxController = session.getControllerForStep("inbox");
    inboxController?.reportInboxProgress?.({ atEnd: false, current: 3, total: 4 });

    expect(store.scheduleRefresh).toHaveBeenCalledWith(TEST_SETTINGS, 0, { scope: "workflow" });
    expect(store.scheduleRefresh).toHaveBeenCalledWith(TEST_SETTINGS, 0, { scope: "projects" });
  });

  it("keeps inbox milestone prefetch in the session and only schedules each scope once", async () => {
    const store = createStore();
    const session = createReviewSession({
      mode: "weekly",
      settings: TEST_SETTINGS,
      store,
      t,
    });

    await session.activate("inbox");
    vi.mocked(store.scheduleRefresh).mockClear();
    const inboxController = session.getControllerForStep("inbox");
    inboxController?.reportInboxProgress?.({ atEnd: false, current: 3, total: 4 });
    inboxController?.reportInboxProgress?.({ atEnd: true, current: 3, total: 4 });

    expect(store.scheduleRefresh).toHaveBeenCalledTimes(2);
  });

  it("defers the projects refresh until after paint when activating step 2", async () => {
    const store = createStore();
    const session = createReviewSession({
      mode: "weekly",
      settings: TEST_SETTINGS,
      store,
      t,
    });

    const activation = session.activate("projects");

    expect(store.scheduleRefresh).not.toHaveBeenCalled();

    await activation;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.scheduleRefresh).toHaveBeenCalledWith(TEST_SETTINGS, 0, { scope: "projects" });
  });

  it("skips the projects refresh when the slice was loaded recently", async () => {
    const now = 100_000;
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const store = createStore({
        projects: [
          {
            lastTodoCreatedTime: null,
            lastTodoText: null,
            lastTodoUid: null,
            pageTitle: "Launch Site",
            pageUid: "project-launch",
            statusBlockUid: null,
            statusText: null,
            todoCount: 1,
            todoListUid: null,
          },
        ],
        projectsHydrated: true,
        projectsLoadedAt: now - 5000,
      });
      const session = createReviewSession({
        mode: "weekly",
        settings: TEST_SETTINGS,
        store,
        t,
      });

      await session.activate("projects");
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(store.scheduleRefresh).not.toHaveBeenCalled();
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it("still schedules a projects refresh after paint when step 2 activates during a warmup", async () => {
    const store = createStore({
      projectsHydrated: false,
      projectsLoadedAt: null,
      projectsLoading: true,
    });
    const session = createReviewSession({
      mode: "weekly",
      settings: TEST_SETTINGS,
      store,
      t,
    });

    const activation = session.activate("projects");

    expect(store.scheduleRefresh).not.toHaveBeenCalled();

    await activation;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.scheduleRefresh).toHaveBeenCalledWith(TEST_SETTINGS, 0, { scope: "projects" });
  });

  it("does not schedule downstream warmup from inbox milestones in daily mode", async () => {
    const store = createStore();
    const session = createReviewSession({
      mode: "daily",
      settings: TEST_SETTINGS,
      store,
      t,
    });

    await session.activate("inbox");
    // The inbox onActivate defers its refresh via requestAnimationFrame (falls
    // back to setTimeout(0) in tests).  Flush the pending callback.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.scheduleRefresh).toHaveBeenCalledWith(TEST_SETTINGS, 0, { scope: "inboxOnly" });
    vi.mocked(store.scheduleRefresh).mockClear();
    session.getControllerForStep("inbox")?.reportInboxProgress?.({
      atEnd: true,
      current: 1,
      total: 1,
    });

    expect(store.scheduleRefresh).not.toHaveBeenCalled();
  });

  it("schedules scoped refreshes from default controller activation", async () => {
    const store = createStore();
    const session = createReviewSession({
      mode: "weekly",
      now: new Date("2026-03-03T12:00:00.000Z"),
      settings: TEST_SETTINGS,
      store,
      t,
    });

    await session.activate("inbox");
    // Flush the deferred inbox refresh (rAF → setTimeout(0) fallback in tests).
    await new Promise((resolve) => setTimeout(resolve, 0));
    await session.activate("projects");
    // Projects now defer their refresh until after paint for a smoother step transition.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await session.activate("upcoming");
    await session.activate("tickler");
    await session.activate("stats");

    expect(store.scheduleRefresh).toHaveBeenCalledWith(TEST_SETTINGS, 0, { scope: "inboxOnly" });
    expect(store.scheduleRefresh).toHaveBeenCalledWith(TEST_SETTINGS, 0, { scope: "projects" });
    expect(store.scheduleRefresh).toHaveBeenCalledWith(TEST_SETTINGS, 0, { scope: "workflow" });
    expect(store.scheduleRefresh).toHaveBeenCalledWith(TEST_SETTINGS, 0, { scope: "backHalf" });
  });

  it("lets the built-in inbox controller publish shell chrome through the session snapshot", async () => {
    const store = createStore();
    const session = createReviewSession({
      mode: "weekly",
      settings: TEST_SETTINGS,
      store,
      t,
    });

    await session.activate("inbox");
    const inboxController = session.getControllerForStep("inbox");

    inboxController?.publishSnapshot(
      "inbox",
      createControllerSnapshot("inbox", {
        footer: {
          leftAction: null,
          rightAction: {
            action: "forward",
            intent: "primary",
            kind: "button",
            labelKey: "nextStep",
          },
        },
        header: {
          legendSegments: [{ color: "#fff", text: "u up" }],
          progressValue: 0.42,
          title: "Published Inbox",
        },
        stepSlot: { error: null, mode: "ready" },
      }),
    );

    expect(session.getSnapshot().activeStep.stepSnapshot?.header.title).toBe("Published Inbox");
    expect(session.getSnapshot().activeStep.stepSnapshot?.footer.rightAction?.labelKey).toBe(
      "nextStep",
    );
    expect(session.getSnapshot().activeStep.stepSnapshot?.header.progressValue).toBe(0.42);
  });

  it("publishes shell chrome through the concrete inbox controller contract", async () => {
    const onActivate = vi.fn();
    const controller: InboxStepController = createInboxStepController({
      getFallbackSnapshot: () => createControllerSnapshot("inbox"),
      onActivate,
    });
    const onUpdate = vi.fn();
    const unsubscribe = controller.subscribe(onUpdate);

    controller.publishSnapshot(
      "inbox",
      createControllerSnapshot("inbox", {
        footer: {
          leftAction: null,
          rightAction: {
            action: "forward",
            intent: "primary",
            kind: "button",
            labelKey: "nextStep",
          },
        },
        header: {
          legendSegments: [{ color: "#fff", text: "u up" }],
          progressValue: 0.42,
          title: "Published Inbox Controller",
        },
        stepSlot: {
          error: null,
          mode: "ready",
        },
      }),
    );

    await controller.activate("inbox");

    expect(controller.getSnapshot("inbox").header.title).toBe("Published Inbox Controller");
    expect(controller.getSnapshot("inbox").footer.rightAction?.labelKey).toBe("nextStep");
    expect(controller.getSnapshot("inbox").header.progressValue).toBe(0.42);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(2);

    unsubscribe();
    controller.dispose();
  });

  it("uses the built-in projects controller factory instead of the generic fallback", async () => {
    const project = {
      doneCount: 0,
      lastDoneTime: null,
      lastTodoCreatedTime: null,
      lastTodoText: null,
      lastTodoUid: null,
      pageTitle: "Launch Site",
      pageUid: "project-launch",
      statusBlockUid: null,
      statusText: null,
      todoCount: 1,
      todoListUid: null,
      totalCount: 1,
    };
    const store = createStore({ projects: [project] });
    const session = createReviewSession({
      mode: "weekly",
      settings: TEST_SETTINGS,
      store,
      t,
    });

    await session.activate("projects");
    const projectsController = session.getControllerForStep(
      "projects",
    ) as ProjectsStepController | null;
    projectsController?.openProjectDetail(project);

    expect(projectsController?.getSnapshot("projects").detail.projectUid).toBe("project-launch");
    expect(projectsController?.getSnapshot("projects").detail.activeProject?.pageTitle).toBe(
      "Launch Site",
    );
  });
});
