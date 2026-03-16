import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_SETTINGS } from "./fixtures";

vi.mock("@blueprintjs/core", () => {
  return {
    Dialog: ({
      children,
      className,
      isOpen,
      title,
    }: {
      children: React.ReactNode;
      className?: string;
      isOpen: boolean;
      title?: React.ReactNode;
    }) =>
      isOpen
        ? React.createElement(
            "section",
            {
              className,
              "data-title": typeof title === "string" ? title : undefined,
              role: "dialog",
            },
            typeof title === "string" ? React.createElement("h1", null, title) : title,
            children,
          )
        : null,
    ProgressBar: ({ value }: { value?: number }) =>
      React.createElement("div", { "data-progress": value ?? 0 }),
  };
});

const mocks = vi.hoisted(() => ({
  executeRawQuery: vi.fn(() => []),
  getDismissedProjectUidsAfterDismiss: vi.fn((uids: Set<string>, uid: string) => {
    const next = new Set(uids);
    next.add(uid);
    return next;
  }),
  getProjectTodoCurrentTag: vi.fn(() => "watch"),
  isWeeklyReviewEditableElement: vi.fn(() => false),
  loadTriageProjects: vi.fn(
    async ({ onUpdate }: { onUpdate?: (projects: Array<unknown>) => void } = {}) => {
      const projects: Array<unknown> = [];
      onUpdate?.(projects);
      return projects;
    },
  ),
  openInSidebar: vi.fn(),
  persistProjectStatusChange: vi.fn(async () => undefined),
  replaceTag: vi.fn(async () => true),
  replaceTags: vi.fn(async () => true),
  runRoamQuery: vi.fn(() => []),
  scheduleIdleTask: vi.fn((callback: () => void) => {
    callback();
    return () => undefined;
  }),
  showTriageToast: vi.fn(),
}));

vi.mock("../browser-idle", () => ({
  scheduleIdleTask: mocks.scheduleIdleTask,
}));

vi.mock("../data", () => ({
  executeRawQuery: mocks.executeRawQuery,
  runRoamQuery: mocks.runRoamQuery,
}));

vi.mock("../review/actions", () => ({
  removeTagForms: (value: string) => value,
  removeTodoMarker: (value: string) => value,
  replaceTag: mocks.replaceTag,
  replaceTags: mocks.replaceTags,
  stripTodoStatusMarkers: (value: string) => value,
}));

vi.mock("../roam-ui-utils", () => ({
  openInSidebar: mocks.openInSidebar,
}));

vi.mock("../review/schedule", () => ({
  applyScheduleIntentToBlock: vi.fn(async () => true),
  checkScheduleConflict: vi.fn(async () => null),
  clearDueDateChild: vi.fn(async () => undefined),
  getCurrentDueDateValue: vi.fn(() => ""),
}));

vi.mock("../triage/support", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../triage/support")>();
  return {
    ...actual,
    formatNamespacedPageDisplayTitle: (value: string) => value,
    loadTriageProjects: mocks.loadTriageProjects,
  };
});

vi.mock("../triage/step-logic", () => ({
  showTriageToast: mocks.showTriageToast,
}));

vi.mock("../review/wizard-support", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../review/wizard-support")>();
  return {
    ...actual,
    shouldShowTicklerStep: () => true,
  };
});

vi.mock("../components/InboxZeroStep", () => {
  return {
    InboxZeroStep: ({ onAtEndChange }: { onAtEndChange?: (value: boolean) => void }) => {
      React.useEffect(() => {
        onAtEndChange?.(true);
      }, [onAtEndChange]);

      return React.createElement("div", { "data-testid": "inbox-zero-step" }, "Inbox step");
    },
  };
});

vi.mock("../components/ProjectsStep", () => {
  return {
    ProjectsStep: () => React.createElement("div", null, "Projects step"),
  };
});

vi.mock("../components/SchedulePopover", () => {
  return {
    SchedulePopover: () => React.createElement("div", null, "schedule"),
  };
});

vi.mock("../components/TicklerStep", () => {
  return {
    TicklerStep: ({
      activeDetailPageUid,
      groups,
      onOpenDetail,
    }: {
      activeDetailPageUid?: string | null;
      groups: Array<{ dailyPageUid: string; dailyTitle: string }>;
      onOpenDetail?: (pageUid: string) => void;
    }) =>
      React.createElement(
        "div",
        null,
        activeDetailPageUid
          ? `tickler detail ${activeDetailPageUid}`
          : React.createElement(
              "button",
              {
                id: "open-tickler-detail",
                onClick: () => onOpenDetail?.(groups[0]?.dailyPageUid ?? ""),
                type: "button",
              },
              groups[0]?.dailyTitle ?? "tickler",
            ),
      ),
  };
});

vi.mock("../components/WorkflowProcessPopover", () => {
  return {
    WorkflowProcessPopover: ({
      onProcessComplete,
      targetUid,
    }: {
      onProcessComplete: (uid: string, shouldHide: boolean) => void;
      targetUid: string;
    }) =>
      React.createElement(
        "div",
        { id: "mock-triage-popover" },
        React.createElement(
          "button",
          {
            id: "complete-triage",
            onClick: () => onProcessComplete(targetUid, true),
            type: "button",
          },
          "complete triage",
        ),
      ),
  };
});

vi.mock("../components/TriggerListStep", () => {
  return {
    TriggerListStep: () => React.createElement("div", null, "trigger list"),
  };
});

vi.mock("../components/WeeklyReviewRoamBlock", () => ({
  isWeeklyReviewEditableElement: mocks.isWeeklyReviewEditableElement,
}));

vi.mock("../components/WorkflowReviewStep", () => {
  return {
    WorkflowReviewStep: ({
      emptyStepTitle,
      onOpenTriage,
      sections,
    }: {
      emptyStepTitle: string;
      onOpenTriage: (args: {
        anchorElement: HTMLElement;
        currentTag: string;
        item: { text: string; uid: string };
      }) => void;
      sections: Array<{ currentTag: string; items: Array<{ text: string; uid: string }> }>;
    }) => {
      const item = sections.flatMap((section) => section.items)[0];
      const currentTag =
        sections.find((section) => section.items.length > 0)?.currentTag ?? "watch";

      return React.createElement(
        "div",
        null,
        React.createElement("div", null, emptyStepTitle),
        item
          ? React.createElement(
              "button",
              {
                id: `open-triage-${item.uid}`,
                onClick: (event: Event) =>
                  onOpenTriage({
                    anchorElement: event.currentTarget as HTMLElement,
                    currentTag,
                    item,
                  }),
                type: "button",
              },
              item.text,
            )
          : React.createElement("div", null, "empty workflow"),
      );
    },
  };
});

function t(key: string, ...args: Array<string | number>): string {
  switch (key) {
    case "back":
      return "Back";
    case "dailyReviewTitle":
      return "Daily Review";
    case "nextStep":
      return "Next Step";
    case "step1Desc":
      return "Process inbox";
    case "step1Title":
      return "Inbox";
    case "step2Desc":
      return "Review projects";
    case "step2Title":
      return "Projects";
    case "step3Desc":
      return "Review upcoming";
    case "step3Title":
      return "Upcoming";
    case "step4Desc":
      return "Review waiting";
    case "step4Title":
      return "Waiting";
    case "step5Desc":
      return "Review someday";
    case "step5Title":
      return "Someday";
    case "step6Desc":
      return "Review triggers";
    case "step6Title":
      return "Triggers";
    case "step7Desc":
      return "Review tickler";
    case "step7Title":
      return "Tickler";
    case "step8Desc":
      return "Review stats";
    case "step8Title":
      return "Stats";
    case "weekLabel":
      return `Week ${args[0]}`;
    default:
      return key;
  }
}

function createSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    backHalfHydrated: false,
    backHalfLoadedAt: null,
    completedThisWeek: [],
    deferred: [],
    delegated: [],
    inbox: [
      {
        ageDays: 0,
        createdTime: 0,
        deferredDate: null,
        pageTitle: "Inbox",
        text: "Initial inbox item",
        uid: "inbox-1",
      },
    ],
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

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("ReviewWizard orchestration", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doUnmock("../components/ReviewWizardShell");
    dom = new JSDOM("<div id='root'></div>", { url: "https://example.com" });
    root = dom.window.document.getElementById("root") as HTMLDivElement;

    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("localStorage", dom.window.localStorage);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Node", dom.window.Node);
    vi.stubGlobal("MutationObserver", dom.window.MutationObserver);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      dom.window.setTimeout(() => callback(0), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => dom.window.clearTimeout(handle));

    Object.assign(globalThis.window, {
      cancelAnimationFrame: globalThis.cancelAnimationFrame,
      requestAnimationFrame: globalThis.requestAnimationFrame,
      roamAlphaAPI: {
        createBlock: vi.fn(async () => undefined),
        createPage: vi.fn(async () => undefined),
        data: {
          pull: vi.fn(() => ({ ":block/string": "Task", ":block/uid": "task-uid" })),
        },
        ui: {},
        updateBlock: vi.fn(async () => undefined),
        util: {
          generateUID: vi.fn(() => "generated-uid"),
        },
      },
    });
  });

  afterEach(() => {
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    vi.unstubAllGlobals();
    dom.window.close();
  });

  async function renderWizard(args?: {
    mode?: "daily" | "weekly";
    onClose?: () => void;
    snapshot?: ReturnType<typeof createSnapshot>;
  }): Promise<{ onClose: ReturnType<typeof vi.fn> }> {
    const store = {
      dispose: vi.fn(),
      getSnapshot: vi.fn(() => args?.snapshot ?? createSnapshot()),
      refresh: vi.fn(async () => undefined),
      scheduleRefresh: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };
    const onClose = (args?.onClose as ReturnType<typeof vi.fn> | undefined) ?? vi.fn();

    const module = await import("../components/ReviewWizard");

    act(() => {
      ReactDOM.render(
        React.createElement(module.ReviewWizard, {
          isOpen: true,
          mode: args?.mode,
          onClose,
          settings: { ...TEST_SETTINGS, delegateTargetTags: ["people"] },
          store,
          t,
        }),
        root,
      );
    });

    await flush();
    return { onClose };
  }

  function clickPrimaryForward(): Promise<void> {
    const primary = root.querySelector("button.bp3-intent-primary") as HTMLButtonElement | null;
    if (!primary) {
      throw new Error("Missing primary forward button");
    }
    return act(async () => {
      primary.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
  }

  it("persists the weekly step across reopen but resets daily review to inbox", async () => {
    await renderWizard();
    expect(root.textContent).toContain("Inbox");

    await clickPrimaryForward();
    await flush();
    expect(root.textContent).toContain("Projects");

    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });

    await renderWizard();
    expect(root.textContent).toContain("Projects");

    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });

    await renderWizard({ mode: "daily" });
    expect(root.textContent).toContain("Daily Review");
  });

  it("routes the live ReviewWizard through ReviewWizardShell", async () => {
    const reviewWizardShellSpy = vi.fn(() => React.createElement("div", null, "shell"));
    vi.doMock("../components/ReviewWizardShell", () => ({
      ReviewWizardShell: reviewWizardShellSpy,
    }));
    const module = await import("../components/ReviewWizard");

    act(() => {
      ReactDOM.render(
        React.createElement(module.ReviewWizard, {
          isOpen: true,
          onClose: vi.fn(),
          settings: { ...TEST_SETTINGS, delegateTargetTags: ["people"] },
          store: {
            dispose: vi.fn(),
            getSnapshot: vi.fn(() => createSnapshot()),
            refresh: vi.fn(async () => undefined),
            scheduleRefresh: vi.fn(),
            subscribe: vi.fn(() => () => undefined),
          },
          t,
        }),
        root,
      );
    });

    expect(reviewWizardShellSpy).toHaveBeenCalled();
  });

  it("renders dialog chrome before the active step container mounts", async () => {
    const store = {
      dispose: vi.fn(),
      getSnapshot: vi.fn(() => createSnapshot()),
      refresh: vi.fn(async () => undefined),
      scheduleRefresh: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };
    const module = await import("../components/ReviewWizard");

    act(() => {
      ReactDOM.render(
        React.createElement(module.ReviewWizard, {
          isOpen: true,
          onClose: vi.fn(),
          settings: { ...TEST_SETTINGS, delegateTargetTags: ["people"] },
          store,
          t,
        }),
        root,
      );
    });

    expect(root.querySelector(".roam-gtd-review-dialog")).not.toBeNull();
    expect(root.textContent).toContain("Inbox");
    expect(root.querySelector("[data-testid='inbox-zero-step']")).toBeNull();

    await flush();

    expect(root.querySelector("[data-testid='inbox-zero-step']")).not.toBeNull();
  });

  it("keeps cross-step warmup in the session rather than the shell", async () => {
    const settings = { ...TEST_SETTINGS, delegateTargetTags: ["people"] };
    const store = {
      dispose: vi.fn(),
      getSnapshot: vi.fn(() => createSnapshot()),
      refresh: vi.fn(async () => undefined),
      scheduleRefresh: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };
    const { ReviewWizardShell } = await import("../components/ReviewWizardShell");
    const { createReviewSession } = await import("../review/session/create-review-session");
    const session = createReviewSession({
      mode: "weekly",
      settings,
      store,
      t,
    });

    await act(async () => {
      ReactDOM.render(
        React.createElement(ReviewWizardShell, {
          isOpen: true,
          onClose: vi.fn(),
          registerShortcutHandler: false,
          session,
        }),
        root,
      );
      await Promise.resolve();
    });
    await flush();

    expect(store.scheduleRefresh).toHaveBeenCalledTimes(1);
    expect(store.scheduleRefresh).toHaveBeenNthCalledWith(1, settings, 0, {
      scope: "inboxOnly",
    });

    session.getControllerForStep("inbox")?.reportInboxProgress?.({
      atEnd: false,
      current: 3,
      total: 4,
    });

    expect(store.scheduleRefresh).toHaveBeenCalledTimes(3);
    expect(store.scheduleRefresh).toHaveBeenNthCalledWith(2, settings, 0, {
      scope: "workflow",
    });
    expect(store.scheduleRefresh).toHaveBeenNthCalledWith(3, settings, 0, {
      scope: "projects",
    });
  });

  it("navigates with arrow keys when focus is not inside an editable element", async () => {
    await renderWizard();
    expect(root.textContent).toContain("Inbox");

    await act(async () => {
      dom.window.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }),
      );
      dom.window.dispatchEvent(
        new dom.window.KeyboardEvent("keyup", { bubbles: true, key: "ArrowRight" }),
      );
      await Promise.resolve();
    });
    await flush();

    expect(root.textContent).toContain("Projects");

    await act(async () => {
      dom.window.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowLeft" }),
      );
      dom.window.dispatchEvent(
        new dom.window.KeyboardEvent("keyup", { bubbles: true, key: "ArrowLeft" }),
      );
      await Promise.resolve();
    });
    await flush();

    expect(root.textContent).toContain("Inbox");
  });

  it("opens workflow triage and hides the processed item when the popover completes", async () => {
    await renderWizard({
      snapshot: createSnapshot({
        waitingFor: [
          {
            ageDays: 1,
            createdTime: 0,
            deferredDate: null,
            pageTitle: "Inbox",
            text: "Follow up",
            uid: "wait-1",
          },
        ],
      }),
    });

    await clickPrimaryForward();
    await flush();
    await clickPrimaryForward();
    await flush();
    await clickPrimaryForward();
    await flush();

    const openTriageButton = root.querySelector("#open-triage-wait-1") as HTMLButtonElement | null;
    expect(openTriageButton).not.toBeNull();

    await act(async () => {
      openTriageButton?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    await flush();

    const completeButton = root.querySelector("#complete-triage") as HTMLButtonElement | null;
    expect(completeButton).not.toBeNull();

    await act(async () => {
      completeButton?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    await flush();

    expect(root.querySelector("#mock-triage-popover")).toBeNull();
    expect(root.textContent).not.toContain("Follow up");
  });

  it("archives legacy todo text into canonical archived text from the workflow step shortcut", async () => {
    const pull = vi.fn((_: string, selector: [string, string]) => {
      if (selector[1] === "wait-1") {
        return { ":block/string": "[[TODO]] Follow up", ":block/uid": "wait-1" };
      }
      return { ":block/string": "Task", ":block/uid": selector[1] };
    });
    const updateBlock = vi.fn(async () => undefined);
    Object.assign(globalThis.window, {
      roamAlphaAPI: {
        ...globalThis.window.roamAlphaAPI,
        data: { pull },
        updateBlock,
      },
    });

    await renderWizard({
      snapshot: createSnapshot({
        waitingFor: [
          {
            ageDays: 1,
            createdTime: 0,
            deferredDate: null,
            pageTitle: "Inbox",
            text: "Follow up",
            uid: "wait-1",
          },
        ],
      }),
    });

    await clickPrimaryForward();
    await flush();
    await clickPrimaryForward();
    await flush();
    await clickPrimaryForward();
    await flush();

    const dialog = root.querySelector(".roam-gtd-review-dialog") as HTMLElement | null;
    expect(dialog).not.toBeNull();

    const input = dom.window.document.createElement("textarea");
    input.className = "rm-block-input";
    input.id = "block-input-wait-1";
    dialog?.append(input);
    input.focus();

    await act(async () => {
      dom.window.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          bubbles: true,
          ctrlKey: true,
          key: "Enter",
          shiftKey: true,
        }),
      );
      await Promise.resolve();
    });
    await flush();

    expect(updateBlock).toHaveBeenCalledWith({
      block: { string: "{{[[ARCHIVED]]}} Follow up", uid: "wait-1" },
    });
    expect(root.textContent).not.toContain("Follow up");
  });

  it("closes immediately after save summary and close without awaiting the summary write", async () => {
    const createBlock = vi.fn(
      () =>
        new Promise<void>(() => {
          // Intentionally never resolves during this assertion.
        }),
    );
    Object.assign(globalThis.window, {
      roamAlphaAPI: {
        ...globalThis.window.roamAlphaAPI,
        createBlock,
        createPage: vi.fn(async () => undefined),
        util: {
          generateUID: vi.fn(() => "generated-uid"),
        },
      },
    });
    const runtime = await import("../review/wizard-runtime");
    runtime.persistReviewStepIndex("weekly", 7);
    const { onClose } = await renderWizard({
      snapshot: createSnapshot({
        inbox: [],
        nextActions: [],
        projects: [],
        projectsHydrated: true,
      }),
    });

    const saveButton = Array.from(root.querySelectorAll("button")).find(
      (button) =>
        button.textContent?.includes("saveWeeklySummary") ||
        button.textContent?.includes("Save Weekly Summary") ||
        button.textContent?.includes("summarySaved"),
    ) as HTMLButtonElement | undefined;
    expect(saveButton).toBeDefined();

    await act(async () => {
      saveButton?.click();
      await Promise.resolve();
    });

    expect(onClose).toHaveBeenCalledOnce();
    expect(createBlock).toHaveBeenCalled();
  });

  it("opens tickler date detail and closes it with the footer Back button", async () => {
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        super(args[0] ?? "2026-03-05T12:00:00Z");
      }

      static now(): number {
        return new RealDate("2026-03-05T12:00:00Z").valueOf();
      }
    }

    vi.stubGlobal("Date", MockDate as unknown as DateConstructor);
    const runtime = await import("../review/wizard-runtime");
    runtime.persistReviewStepIndex("weekly", 6);

    await renderWizard({
      snapshot: createSnapshot({
        inbox: [],
        nextActions: [],
        projects: [],
        projectsHydrated: true,
        ticklerItems: [
          {
            dailyPageUid: "day-1",
            dailyTitle: "March 10th, 2026",
            items: [
              {
                ageDays: 0,
                createdTime: 0,
                deferredDate: null,
                pageTitle: "Tickler",
                text: "Tickler item",
                uid: "tickler-1",
              },
            ],
          },
        ],
      }),
    });
    const detailButton = root.querySelector("#open-tickler-detail") as HTMLButtonElement | null;
    expect(detailButton?.textContent).toBe("March 10th, 2026");

    await act(async () => {
      detailButton?.click();
      await Promise.resolve();
    });
    await flush();

    expect(root.textContent).toContain("tickler detail day-1");
    expect(root.querySelector(".roam-gtd-dialog-title-text")?.textContent).toBe("March 10th, 2026");

    const backButton = Array.from(root.querySelectorAll("button")).find(
      (button) => button.textContent === "Back",
    ) as HTMLButtonElement | undefined;
    expect(backButton).toBeDefined();

    await act(async () => {
      backButton?.click();
      await Promise.resolve();
    });
    await flush();

    expect(root.textContent).toContain("March 10th, 2026");
    expect(root.textContent).not.toContain("tickler detail day-1");
  });
});
