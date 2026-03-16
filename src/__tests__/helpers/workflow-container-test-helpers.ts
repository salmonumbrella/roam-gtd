import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { vi } from "vitest";

import type { TranslatorFn } from "../../i18n";
import { TEST_SETTINGS } from "../fixtures";

export type WorkflowContainerStepKey = "tickler" | "waitingDelegated";

export type WorkflowContainerTodo = {
  ageDays: number;
  createdTime: number;
  deferredDate: string | null;
  pageTitle: string;
  text: string;
  uid: string;
};

export type WorkflowContainerTicklerGroup = {
  dailyPageUid: string;
  dailyTitle: string;
  items: Array<WorkflowContainerTodo>;
};

export type WorkflowContainerTestState = {
  backHalfHydrated: boolean;
  completedThisWeek: Array<unknown>;
  deferred: Array<unknown>;
  delegated: Array<WorkflowContainerTodo>;
  inbox: Array<unknown>;
  lastWeekMetrics: null;
  loading: boolean;
  nextActions: Array<WorkflowContainerTodo>;
  projects: Array<unknown>;
  projectsHydrated: boolean;
  projectsLoading: boolean;
  someday: Array<WorkflowContainerTodo>;
  stale: Array<unknown>;
  ticklerItems: Array<WorkflowContainerTicklerGroup>;
  topGoals: Array<unknown>;
  triagedThisWeekCount: number;
  waitingFor: Array<WorkflowContainerTodo>;
  workflowHydrated: boolean;
};

type WorkflowControllerDomainKey = "tickler" | "workflow";

interface PendingRenderRequest {
  container: HTMLElement;
  uid: string;
}

function createRenderedBlockMarkup(uid: string, text: string): string {
  return `
    <div class="rm-block-main" data-rendered-uid="${uid}" data-uid="${uid}">
      <div class="rm-block__input">${text}</div>
    </div>
  `;
}

export function createControlledRenderBlockHarness() {
  const pendingRenderRequests = new Map<string, PendingRenderRequest>();
  const renderBlock = vi.fn(
    ({ el, uid }: { el: HTMLElement; uid: string } & Record<string, unknown>) => {
      pendingRenderRequests.set(uid, {
        container: el,
        uid,
      });
    },
  );

  return {
    hasPending(uid: string): boolean {
      return pendingRenderRequests.has(uid);
    },
    async publishReady(uid: string, text = uid): Promise<void> {
      const request = pendingRenderRequests.get(uid);
      if (!request) {
        throw new Error(`No pending render request found for uid "${uid}"`);
      }

      await act(async () => {
        request.container.innerHTML = createRenderedBlockMarkup(uid, text);
        await Promise.resolve();
      });
    },
    renderBlock,
    async waitForPending(
      uid: string,
      flushScheduledWork: () => Promise<void>,
      attempts = 6,
    ): Promise<void> {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (pendingRenderRequests.has(uid)) {
          return;
        }
        await flushScheduledWork();
      }
      throw new Error(`Timed out waiting for pending render request "${uid}"`);
    },
  };
}

export function createWorkflowTodo(
  uid: string,
  overrides: Partial<WorkflowContainerTodo> = {},
): WorkflowContainerTodo {
  return {
    ageDays: 0,
    createdTime: 0,
    deferredDate: null,
    pageTitle: "Inbox",
    text: uid,
    uid,
    ...overrides,
  };
}

export function createWorkflowSnapshot(
  overrides: Partial<WorkflowContainerTestState> = {},
): WorkflowContainerTestState {
  return {
    backHalfHydrated: false,
    completedThisWeek: [],
    deferred: [],
    delegated: [],
    inbox: [],
    lastWeekMetrics: null,
    loading: false,
    nextActions: [],
    projects: [],
    projectsHydrated: false,
    projectsLoading: false,
    someday: [],
    stale: [],
    ticklerItems: [],
    topGoals: [],
    triagedThisWeekCount: 0,
    waitingFor: [],
    workflowHydrated: false,
    ...overrides,
  };
}

export function createWorkflowStore(initialState: WorkflowContainerTestState) {
  let currentState = initialState;
  const listeners = new Set<(state: WorkflowContainerTestState) => void>();

  return {
    emit(nextState: WorkflowContainerTestState) {
      currentState = nextState;
      for (const listener of listeners) {
        listener(nextState);
      }
    },
    store: {
      dispose: vi.fn(),
      getSnapshot: vi.fn(() => currentState),
      refresh: vi.fn(async () => undefined),
      scheduleRefresh: vi.fn(),
      subscribe: vi.fn((listener: (state: WorkflowContainerTestState) => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }),
    },
  };
}

export function createWorkflowSession(domainKey: WorkflowControllerDomainKey) {
  const controller = {
    activate: vi.fn(async () => undefined),
    clearWorkflowTriageForUid: vi.fn(),
    closePersonDetail: vi.fn(),
    closeTicklerDetail: vi.fn(),
    closeWorkflowTriage: vi.fn(),
    deactivate: vi.fn(),
    dispose: vi.fn(),
    domainKey,
    getSnapshot: vi.fn(() => null),
    openPersonDetail: vi.fn(),
    openTicklerDetail: vi.fn(),
    openWorkflowTriage: vi.fn(),
    publishSnapshot: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  };

  return {
    controller,
    session: {
      activate: vi.fn(async () => undefined),
      dispose: vi.fn(),
      getControllerDomainForStep: vi.fn(() => domainKey),
      getControllerForStep: vi.fn(() => controller),
      getSnapshot: vi.fn(() => ({
        activeStep: {
          controllerDomain: domainKey,
          step: {
            description: domainKey === "tickler" ? "Review tickler" : "Review waiting",
            key: domainKey === "tickler" ? "tickler" : "waitingDelegated",
            title: domainKey === "tickler" ? "Step 7: Tickler" : "Step 4: Waiting For",
          },
          stepKey: domainKey === "tickler" ? "tickler" : "waitingDelegated",
          stepSnapshot: null,
        },
        activeStepKey: domainKey === "tickler" ? "tickler" : "waitingDelegated",
        controllerStates: {
          dashboard: { error: null, snapshot: null, status: "cold", stepKey: null },
          inbox: { error: null, snapshot: null, status: "cold", stepKey: null },
          projects: { error: null, snapshot: null, status: "cold", stepKey: null },
          tickler: { error: null, snapshot: null, status: "cold", stepKey: null },
          workflow: { error: null, snapshot: null, status: "cold", stepKey: null },
        },
        mode: "weekly" as const,
        steps: [],
      })),
      subscribe: vi.fn(() => () => undefined),
    },
  };
}

export const workflowContainerTestTranslator: TranslatorFn = ((
  key: string,
  ...args: Array<string | number>
) => {
  switch (key) {
    case "ageDays":
      return `${args[0] ?? 0} days`;
    case "allClear":
      return "All clear";
    case "allClearTitle":
      return `${args[0] ?? "Step"} complete`;
    case "nextStep":
      return "Next Step";
    case "step4Title":
      return "Step 4: Waiting For";
    case "step7Title":
      return "Step 7: Tickler";
    case "ticklerThisMonth":
      return `This month: ${args[0] ?? 0}`;
    case "watching":
      return "Watching";
    default:
      return key;
  }
}) as TranslatorFn;

export function createWorkflowContainerDomHarness(
  options: {
    pull?: ReturnType<typeof vi.fn>;
    renderBlock?: ReturnType<typeof vi.fn>;
  } = {},
) {
  vi.useFakeTimers();

  const dom = new JSDOM("<div id='root'></div>", { url: "https://example.com" });
  const root = dom.window.document.getElementById("root") as HTMLDivElement;
  const pull = options.pull ?? vi.fn(() => null);
  const renderBlock = options.renderBlock ?? vi.fn();

  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("DocumentFragment", dom.window.DocumentFragment);
  vi.stubGlobal("Event", dom.window.Event);
  vi.stubGlobal("FocusEvent", dom.window.FocusEvent);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("KeyboardEvent", dom.window.KeyboardEvent);
  vi.stubGlobal("MouseEvent", dom.window.MouseEvent);
  vi.stubGlobal("MutationObserver", dom.window.MutationObserver);
  vi.stubGlobal("Node", dom.window.Node);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    dom.window.setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => dom.window.clearTimeout(handle));
  vi.stubGlobal("self", dom.window);

  Object.assign(globalThis.window, {
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    roamAlphaAPI: {
      data: {
        pull,
      },
      ui: {
        components: {
          renderBlock,
        },
        getFocusedBlock: vi.fn(() => null),
      },
      updateBlock: vi.fn(async () => undefined),
    },
    roamjs: {
      extension: {
        workbench: {
          refreshAttributeSelect: vi.fn(),
        },
      },
    },
  });

  return {
    cleanup(): void {
      act(() => {
        ReactDOM.unmountComponentAtNode(root);
      });
      vi.useRealTimers();
      vi.unstubAllGlobals();
      dom.window.close();
    },
    dom,
    async flushScheduledWork(): Promise<void> {
      await act(async () => {
        vi.runAllTimers();
        await Promise.resolve();
        vi.runAllTimers();
        await Promise.resolve();
      });
    },
    pull,
    renderBlock,
    root,
  };
}

export async function renderWorkflowStepContainer(args: {
  isLastStep?: boolean;
  root: HTMLDivElement;
  session: ReturnType<typeof createWorkflowSession>["session"];
  stepCount?: number;
  stepIndex: number;
  stepKey: WorkflowContainerStepKey;
  store: ReturnType<typeof createWorkflowStore>["store"];
}): Promise<void> {
  const { WorkflowStepContainer } =
    await import("../../components/review-wizard/containers/WorkflowStepContainer");

  await act(async () => {
    ReactDOM.render(
      React.createElement(WorkflowStepContainer, {
        activeControlsRef: { current: null },
        isLastStep: args.isLastStep ?? false,
        session: args.session as never,
        settings: TEST_SETTINGS,
        stepCount: args.stepCount ?? 8,
        stepIndex: args.stepIndex,
        stepKey: args.stepKey,
        store: args.store as never,
        t: workflowContainerTestTranslator,
      }),
      args.root,
    );
  });
}
