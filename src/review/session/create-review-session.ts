import { createDashboardStepController } from "../controllers/dashboard-step-controller";
import {
  createInboxStepController,
  shouldWarmProjectsFromInboxSignal,
  shouldWarmWorkflowFromInboxSignal,
  wireInboxPrefetchReporter,
} from "../controllers/inbox-step-controller";
import { createProjectsStepController } from "../controllers/projects-step-controller";
import { createTicklerStepController } from "../controllers/tickler-step-controller";
import { createWorkflowStepController } from "../controllers/workflow-step-controller";
import { getReviewWizardFooterState } from "../wizard-navigation";
import { getInitialReviewStepIndex } from "../wizard-runtime";
import {
  getItemsForStep,
  getPrimaryForwardLabelKey,
  getReviewProgressValue,
  getSteps,
  isWorkflowReviewStepKey,
  shouldRefreshProjectsForStep,
  type WizardStep,
  type WizardStepKey,
} from "../wizard-support";
import type {
  CreateReviewSessionArgs,
  ReviewControllerDomain,
  ReviewControllerFactories,
  ReviewControllerSnapshot,
  ReviewControllerState,
  ReviewSession,
  ReviewSessionSnapshot,
  ReviewStepController,
  ReviewStepSlotSnapshot,
} from "./types";

const CONTROLLER_DOMAINS: Array<ReviewControllerDomain> = [
  "inbox",
  "projects",
  "workflow",
  "tickler",
  "dashboard",
];

const STATIC_STEP_SNAPSHOT: ReviewStepSlotSnapshot = {
  error: null,
  mode: "loading",
};

function getControllerDomainForStep(stepKey: WizardStepKey): ReviewControllerDomain | null {
  if (stepKey === "inbox") {
    return "inbox";
  }
  if (stepKey === "projects") {
    return "projects";
  }
  if (isWorkflowReviewStepKey(stepKey)) {
    return "workflow";
  }
  if (stepKey === "tickler") {
    return "tickler";
  }
  if (stepKey === "stats") {
    return "dashboard";
  }
  return null;
}

function createControllerState(): ReviewControllerState {
  return {
    error: null,
    snapshot: null,
    status: "cold",
    stepKey: null,
  };
}

function createControllerStateRecord(): Record<ReviewControllerDomain, ReviewControllerState> {
  return {
    dashboard: createControllerState(),
    inbox: createControllerState(),
    projects: createControllerState(),
    tickler: createControllerState(),
    workflow: createControllerState(),
  };
}

function getFallbackStepIndex(steps: Array<WizardStep>, stepKey: WizardStepKey): number {
  return Math.max(
    0,
    steps.findIndex((step) => step.key === stepKey),
  );
}

function createFallbackControllerSnapshot(args: {
  mode: CreateReviewSessionArgs["mode"];
  stepKey: WizardStepKey;
  steps: Array<WizardStep>;
  stepSlot: ReviewStepSlotSnapshot;
}): ReviewControllerSnapshot {
  const stepIndex = getFallbackStepIndex(args.steps, args.stepKey);
  const step = args.steps[stepIndex] ?? args.steps[0]!;
  const isLastStep = stepIndex === args.steps.length - 1;

  return {
    footer: getReviewWizardFooterState({
      activeDetailKind: "none",
      inboxAtEnd: false,
      inboxIndex: 0,
      isInboxComplete: args.stepKey !== "inbox",
      isInboxWithItems: args.stepKey === "inbox",
      isLastStep,
      primaryForwardLabelKey: getPrimaryForwardLabelKey(args.stepKey, isLastStep),
      projectsForwardState: {
        action: "advanceStep",
        intent: "primary",
        labelKey: "nextStep",
      },
      savedSummary: false,
      showPrimaryForward: true,
      stepIndex,
      stepKey: args.stepKey,
    }),
    header: {
      legendSegments: null,
      progressValue: getReviewProgressValue({
        inboxCurrent: 0,
        inboxTotal: args.steps.length === 1 ? 1 : 0,
        projectsReviewed: 0,
        projectsTotal: 0,
        stepCount: args.steps.length,
        stepIndex,
        stepKey: args.stepKey,
      }),
      title: step.title,
    },
    stepSlot: args.stepSlot,
  };
}

function deferUntilAfterPaint(callback: () => void): void {
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(() => callback());
    return;
  }
  // Test / SSR fallback — setTimeout(0) is the best we can do.
  setTimeout(callback, 0);
}

function scheduleRefreshForStep(
  store: CreateReviewSessionArgs["store"],
  settings: CreateReviewSessionArgs["settings"],
  stepKey: WizardStepKey,
): void {
  if (stepKey === "inbox") {
    // Defer the inbox query until after the browser paints the dialog shell.
    // The Roam Datalog query blocks the main thread for >1s; without this
    // rAF gate the query fires via setTimeout(0) *before* the first paint,
    // making the modal invisible until the query completes.
    deferUntilAfterPaint(() => {
      store.scheduleRefresh(settings, 0, { scope: "inboxOnly" });
    });
    return;
  }
  if (stepKey === "projects") {
    const state = store.getSnapshot();
    if (!shouldRefreshProjectsForStep(stepKey, state.projectsHydrated, state.projectsLoadedAt)) {
      return;
    }
    deferUntilAfterPaint(() => {
      // A warmup can still be in flight here; queueing another scoped refresh is safe
      // and prevents Step 2 from getting stuck behind a stale loading flag.
      store.scheduleRefresh(settings, 0, { scope: "projects" });
    });
    return;
  }
  if (isWorkflowReviewStepKey(stepKey)) {
    store.scheduleRefresh(settings, 0, { scope: "workflow" });
    return;
  }
  if (stepKey === "tickler" || stepKey === "stats") {
    store.scheduleRefresh(settings, 0, { scope: "backHalf" });
  }
}

function createBuiltInControllerFactories(args: {
  mode: CreateReviewSessionArgs["mode"];
  settings: CreateReviewSessionArgs["settings"];
  steps: Array<WizardStep>;
  store: CreateReviewSessionArgs["store"];
  t: CreateReviewSessionArgs["t"];
}): ReviewControllerFactories {
  let activeWorkflowStepKey: Extract<WizardStepKey, "someday" | "upcoming" | "waitingDelegated"> =
    "upcoming";

  return {
    dashboard: () =>
      createDashboardStepController({
        getState: () => args.store.getSnapshot(),
        onActivate: () => {
          scheduleRefreshForStep(args.store, args.settings, "stats");
        },
        t: args.t,
      }) as unknown as ReviewStepController,
    inbox: () =>
      createInboxStepController({
        getFallbackSnapshot: () =>
          createDefaultControllerSnapshot(
            {
              mode: args.mode,
              steps: args.steps,
            },
            "inbox",
          ),
        onActivate: () => {
          scheduleRefreshForStep(args.store, args.settings, "inbox");
        },
      }) as unknown as ReviewStepController,
    projects: () =>
      createProjectsStepController({
        getBodyProjects: () => args.store.getSnapshot().projects,
        getProjectsHydrated: () => args.store.getSnapshot().projectsHydrated,
        getStateProjects: () => args.store.getSnapshot().projects,
        onActivate: () => {
          scheduleRefreshForStep(args.store, args.settings, "projects");
        },
        t: args.t,
      }) as unknown as ReviewStepController,
    tickler: () =>
      createTicklerStepController({
        getBodyGroups: () => args.store.getSnapshot().ticklerItems,
        getStateGroups: () => args.store.getSnapshot().ticklerItems,
        onActivate: () => {
          scheduleRefreshForStep(args.store, args.settings, "tickler");
        },
        t: args.t,
      }) as unknown as ReviewStepController,
    workflow: () =>
      createWorkflowStepController({
        getDelegatedPeople: () => [],
        getVisibleItems: () => getItemsForStep(args.store.getSnapshot(), activeWorkflowStepKey),
        onActivate: (stepKey) => {
          activeWorkflowStepKey = stepKey;
          scheduleRefreshForStep(args.store, args.settings, stepKey);
        },
        t: args.t,
      }) as unknown as ReviewStepController,
  };
}

function createDefaultControllerSnapshot(
  args: { mode: CreateReviewSessionArgs["mode"]; steps: Array<WizardStep> },
  stepKey: WizardStepKey,
): ReviewControllerSnapshot {
  return createFallbackControllerSnapshot({
    mode: args.mode,
    stepKey,
    steps: args.steps,
    stepSlot: {
      error: null,
      mode: "ready",
    },
  });
}

function clampStepIndex(stepCount: number, stepIndex: number): number {
  if (stepCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(stepCount - 1, stepIndex));
}

function getStepOrThrow(steps: Array<WizardStep>, stepKey: WizardStepKey): WizardStep {
  const step = steps.find((entry) => entry.key === stepKey);
  if (!step) {
    throw new Error(`Unknown review step: ${stepKey}`);
  }
  return step;
}

function buildInitialSessionSnapshot(
  args: CreateReviewSessionArgs,
  steps: Array<WizardStep>,
): ReviewSessionSnapshot {
  const activeIndex = clampStepIndex(
    steps.length,
    args.persistedStepIndex ?? getInitialReviewStepIndex(args.mode ?? "weekly"),
  );
  const activeStep = steps[activeIndex];
  const controllerDomain = getControllerDomainForStep(activeStep.key) ?? "static";

  return {
    activeStep: {
      controllerDomain,
      step: activeStep,
      stepKey: activeStep.key,
      stepSnapshot: null,
    },
    activeStepKey: activeStep.key,
    controllerStates: createControllerStateRecord(),
    mode: args.mode ?? "weekly",
    steps,
  } satisfies ReviewSessionSnapshot;
}

function setActiveControllerSnapshot(
  snapshot: ReviewSessionSnapshot,
  stepKey: WizardStepKey,
  controllerDomain: ReviewControllerDomain,
  stepSnapshot: ReviewControllerSnapshot | null,
): ReviewSessionSnapshot {
  const activeStep = getStepOrThrow(snapshot.steps, stepKey);

  return {
    ...snapshot,
    activeStep: {
      controllerDomain,
      step: activeStep,
      stepKey,
      stepSnapshot,
    },
    activeStepKey: stepKey,
  };
}

function setStaticActiveStep(
  snapshot: ReviewSessionSnapshot,
  stepKey: WizardStepKey,
): ReviewSessionSnapshot {
  const step = getStepOrThrow(snapshot.steps, stepKey);
  return {
    ...snapshot,
    activeStep: {
      controllerDomain: "static",
      step,
      stepKey,
      stepSnapshot: null,
    },
    activeStepKey: stepKey,
  };
}

function withControllerState(
  snapshot: ReviewSessionSnapshot,
  domainKey: ReviewControllerDomain,
  controllerState: ReviewControllerState,
): ReviewSessionSnapshot {
  return {
    ...snapshot,
    controllerStates: {
      ...snapshot.controllerStates,
      [domainKey]: controllerState,
    },
  };
}

function toLoadingSnapshot(
  snapshot: ReviewControllerSnapshot | null,
  fallbackSnapshot: ReviewControllerSnapshot,
): ReviewControllerSnapshot {
  if (!snapshot) {
    return fallbackSnapshot;
  }
  return {
    ...snapshot,
    stepSlot: {
      ...snapshot.stepSlot,
      error: null,
      mode: "loading",
    },
  };
}

function toErrorSnapshot(
  snapshot: ReviewControllerSnapshot | null,
  error: Error,
  fallbackSnapshot: ReviewControllerSnapshot,
): ReviewControllerSnapshot {
  if (!snapshot) {
    return fallbackSnapshot;
  }
  return {
    ...snapshot,
    stepSlot: {
      ...snapshot.stepSlot,
      error,
      mode: "error",
    },
  };
}

export function createReviewSession(args: CreateReviewSessionArgs): ReviewSession {
  const mode = args.mode ?? "weekly";
  const steps = getSteps(args.t, mode, args.now);
  const controllerFactories: ReviewControllerFactories = {
    ...createBuiltInControllerFactories({
      mode,
      settings: args.settings,
      steps,
      store: args.store,
      t: args.t,
    }),
    ...args.controllerFactories,
  };
  const controllerInstances = new Map<ReviewControllerDomain, ReviewStepController>();
  const controllerUnsubscribes = new Map<ReviewControllerDomain, () => void>();
  const activationPromises = new Map<ReviewControllerDomain, Promise<void>>();
  const lastRequestedStepKeys = new Map<ReviewControllerDomain, WizardStepKey>();
  const subscribers = new Set<() => void>();
  const prefetchedScopes = new Set<"projects" | "workflow">();
  let disposed = false;
  let snapshot: ReviewSessionSnapshot = buildInitialSessionSnapshot({ ...args, mode }, steps);

  const notify = (): void => {
    for (const subscriber of subscribers) {
      subscriber();
    }
  };

  const applyControllerSnapshot = (
    currentSnapshot: ReviewSessionSnapshot,
    domainKey: ReviewControllerDomain,
    stepKey: WizardStepKey,
    controllerSnapshot: ReviewControllerSnapshot,
  ): ReviewSessionSnapshot => {
    const nextSnapshot = withControllerState(currentSnapshot, domainKey, {
      error: null,
      snapshot: controllerSnapshot,
      status: "ready",
      stepKey,
    });

    if (nextSnapshot.activeStepKey !== stepKey) {
      return nextSnapshot;
    }

    return setActiveControllerSnapshot(nextSnapshot, stepKey, domainKey, controllerSnapshot);
  };

  const syncControllerSnapshot = (domainKey: ReviewControllerDomain): void => {
    const controller = controllerInstances.get(domainKey);
    const stepKey = lastRequestedStepKeys.get(domainKey);
    if (!controller || !stepKey || disposed) {
      return;
    }
    snapshot = applyControllerSnapshot(
      snapshot,
      domainKey,
      stepKey,
      controller.getSnapshot(stepKey),
    );
    notify();
  };

  const ensureController = (domainKey: ReviewControllerDomain): ReviewStepController => {
    const existing = controllerInstances.get(domainKey);
    if (existing) {
      return existing;
    }

    const baseController = controllerFactories[domainKey]();
    const controller =
      domainKey === "inbox" && mode === "weekly"
        ? wireInboxPrefetchReporter(baseController, (signal) => {
            if (!prefetchedScopes.has("workflow") && shouldWarmWorkflowFromInboxSignal(signal)) {
              prefetchedScopes.add("workflow");
              args.store.scheduleRefresh(args.settings, 0, { scope: "workflow" });
            }
            if (!prefetchedScopes.has("projects") && shouldWarmProjectsFromInboxSignal(signal)) {
              prefetchedScopes.add("projects");
              args.store.scheduleRefresh(args.settings, 0, { scope: "projects" });
            }
          })
        : baseController;
    controllerInstances.set(domainKey, controller);
    controllerUnsubscribes.set(
      domainKey,
      controller.subscribe(() => {
        syncControllerSnapshot(domainKey);
      }),
    );
    return controller;
  };

  // Subscribe to the store so that when data arrives (e.g. projectsHydrated
  // flips to true), the session re-syncs the active controller's snapshot.
  // This prevents a deadlock where a container publishes "loading", gets
  // unmounted by ReviewStepSlot's skeleton, and can never publish "ready".
  const storeUnsubscribe = args.store.subscribe(() => {
    if (disposed) {
      return;
    }
    const activeStepKey = snapshot.activeStepKey;
    const activeDomain = getControllerDomainForStep(activeStepKey);
    if (!activeDomain) {
      return;
    }
    const activeState = snapshot.controllerStates[activeDomain];
    if (activeState.status !== "ready" || activeState.snapshot?.stepSlot.mode !== "loading") {
      return;
    }
    // The active step's published snapshot says "loading" but the store
    // may have new data. Re-sync from the controller.
    syncControllerSnapshot(activeDomain);
  });

  return {
    activate(stepKey: WizardStepKey): Promise<void> {
      const previousStepKey = snapshot.activeStepKey;
      const previousDomainKey = getControllerDomainForStep(previousStepKey);
      const previousController =
        previousStepKey !== stepKey && previousDomainKey
          ? (controllerInstances.get(previousDomainKey) ?? null)
          : null;

      if (previousController) {
        previousController.deactivate(previousStepKey);
      }

      const domainKey = getControllerDomainForStep(stepKey);
      if (!domainKey) {
        snapshot = setStaticActiveStep(snapshot, stepKey);
        notify();
        return Promise.resolve();
      }

      lastRequestedStepKeys.set(domainKey, stepKey);
      const previousState = snapshot.controllerStates[domainKey];
      const reusableSnapshot = previousState.stepKey === stepKey ? previousState.snapshot : null;
      const fallbackLoadingSnapshot = createFallbackControllerSnapshot({
        mode,
        stepKey,
        steps,
        stepSlot: {
          ...STATIC_STEP_SNAPSHOT,
        },
      });
      snapshot = withControllerState(
        setActiveControllerSnapshot(
          snapshot,
          stepKey,
          domainKey,
          toLoadingSnapshot(reusableSnapshot, fallbackLoadingSnapshot),
        ),
        domainKey,
        {
          error: null,
          snapshot: toLoadingSnapshot(reusableSnapshot, fallbackLoadingSnapshot),
          status: "warming",
          stepKey,
        },
      );
      notify();

      const inFlight = activationPromises.get(domainKey);
      if (inFlight) {
        return inFlight;
      }

      const controller = ensureController(domainKey);
      const activation = controller
        .activate(stepKey)
        .then(() => {
          activationPromises.delete(domainKey);
          syncControllerSnapshot(domainKey);
        })
        .catch((error: unknown) => {
          activationPromises.delete(domainKey);
          if (disposed) {
            return;
          }
          const resolvedError = error instanceof Error ? error : new Error(String(error));
          const retryStepKey = lastRequestedStepKeys.get(domainKey) ?? stepKey;
          const previousState = snapshot.controllerStates[domainKey];
          const previousSnapshot =
            previousState.stepKey === retryStepKey ? previousState.snapshot : null;
          const errorSnapshot = toErrorSnapshot(
            previousSnapshot,
            resolvedError,
            createFallbackControllerSnapshot({
              mode,
              stepKey: retryStepKey,
              steps,
              stepSlot: {
                ...STATIC_STEP_SNAPSHOT,
                error: resolvedError,
                mode: "error",
              },
            }),
          );

          snapshot = withControllerState(snapshot, domainKey, {
            error: resolvedError,
            snapshot: errorSnapshot,
            status: "error",
            stepKey: retryStepKey,
          });
          if (snapshot.activeStepKey === retryStepKey) {
            snapshot = setActiveControllerSnapshot(
              snapshot,
              retryStepKey,
              domainKey,
              errorSnapshot,
            );
          }
          notify();
          throw resolvedError;
        });

      activationPromises.set(domainKey, activation);
      return activation;
    },
    dispose(): void {
      disposed = true;
      storeUnsubscribe();
      activationPromises.clear();
      for (const unsubscribe of controllerUnsubscribes.values()) {
        unsubscribe();
      }
      controllerUnsubscribes.clear();
      for (const controller of controllerInstances.values()) {
        controller.dispose();
      }
      subscribers.clear();
    },
    getControllerDomainForStep,
    getControllerForStep(stepKey: WizardStepKey): ReviewStepController | null {
      const domainKey = getControllerDomainForStep(stepKey);
      return domainKey ? (controllerInstances.get(domainKey) ?? null) : null;
    },
    getSnapshot(): ReviewSessionSnapshot {
      return snapshot;
    },
    subscribe(listener: () => void): () => void {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
  };
}
