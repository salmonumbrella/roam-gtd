import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_SETTINGS } from "./fixtures";

vi.mock("../roam-ui-utils", () => ({
  openInSidebar: vi.fn(),
}));

vi.mock("../components/InboxZeroStep", () => ({
  InboxZeroStep: () => React.createElement("div", null, "InboxZeroStep"),
}));

vi.mock("../components/ProjectsStep", () => ({
  ProjectsStep: () => React.createElement("div", null, "ProjectsStep"),
}));

vi.mock("../components/DashboardStep", () => ({
  DashboardStep: () => React.createElement("div", null, "DashboardStep"),
}));

vi.mock("../components/NextActionsStep", () => ({
  NextActionsStep: () => React.createElement("div", null, "NextActionsStep"),
}));

vi.mock("../components/WaitingForStep", () => ({
  WaitingForStep: () => React.createElement("div", null, "WaitingForStep"),
}));

vi.mock("../components/SomedayMaybeStep", () => ({
  SomedayMaybeStep: () => React.createElement("div", null, "SomedayMaybeStep"),
}));

vi.mock("../components/TriggersStep", () => ({
  TriggersStep: () => React.createElement("div", null, "TriggersStep"),
}));

vi.mock("../components/TicklerStep", () => ({
  TicklerStep: () => React.createElement("div", null, "TicklerStep"),
}));

vi.mock("../components/WorkflowProcessPopover", () => ({
  WorkflowProcessPopover: ({ targetUid }: { targetUid: string }) =>
    React.createElement("div", { id: "workflow-process-popover" }, targetUid),
}));

vi.mock("../components/SchedulePopover", () => ({
  SchedulePopover: () => React.createElement("div", { id: "schedule-popover" }, "SchedulePopover"),
}));

vi.mock("../components/review-wizard/ReviewWizardHeader", () => ({
  ReviewWizardProgressBar: ({ progressValue }: { progressValue: number }) =>
    React.createElement("div", { "data-progress": progressValue }),
}));

function t(key: string, ...args: Array<string | number>): string {
  return args.length > 0 ? `${key}:${args.join(",")}` : key;
}

function createTodo(uid: string) {
  return {
    ageDays: 0,
    createdTime: 0,
    deferredDate: null,
    pageTitle: "Page",
    text: uid,
    uid,
  };
}

describe("ReviewWizardBody", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    dom = new JSDOM("<div id='root'></div>", { url: "https://example.com" });
    root = dom.window.document.getElementById("root") as HTMLDivElement;

    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Node", dom.window.Node);
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(root);
    vi.unstubAllGlobals();
  });

  it("renders workflow step content and workflow popover through the shared body surface", async () => {
    const { ReviewWizardBody } = await import("../components/review-wizard/ReviewWizardBody");

    await act(async () => {
      ReactDOM.render(
        <ReviewWizardBody
          bodyRef={{ current: null }}
          bodyState={{ ticklerItems: [] } as never}
          bodyStep={{ description: "", key: "upcoming", title: "Upcoming" }}
          inbox={{
            goBackRef: { current: null },
            isLoading: false,
            items: [],
            onAdvance: () => undefined,
            onAtEndChange: () => undefined,
            onIndexChange: () => undefined,
            onProgressChange: () => undefined,
            settings: TEST_SETTINGS,
            skipItemRef: { current: null },
            store: {} as never,
          }}
          progressValue={0.5}
          projects={{
            detailProjectPageUid: null,
            dismissedUids: new Set(),
            focusRequestUid: null,
            hotkeyBindings: {
              delegate: "d",
              reference: "r",
              someday: "s",
              up: "u",
              watch: "w",
            },
            onCreateProjectTodo: async () => undefined,
            onDismissProject: () => undefined,
            onFocusRequestHandled: () => undefined,
            onOpenProjectDetail: () => undefined,
            onProjectTodoBlur: () => undefined,
            onStatusChange: () => true,
            onTodoHotkeyAction: async () => undefined,
            projects: [],
            projectsHydrated: true,
          }}
          settings={TEST_SETTINGS}
          t={t}
          tickler={{
            activeDetailPageUid: null,
            groups: [],
            itemCount: 0,
            onItemProcessed: () => undefined,
            onOpenDetail: () => undefined,
            onPromoteToNext: () => undefined,
            schedulePopover: null,
          }}
          workflow={{
            activePersonDetail: null,
            activeTriageUid: "task-1",
            delegatedChildPersonRefs: new Map(),
            delegatedItems: [],
            delegatedPeople: [],
            items: [createTodo("task-1")],
            onItemProcessed: () => undefined,
            onOpenPersonDetail: () => undefined,
            onOpenTriage: () => undefined,
            waitingItems: [],
          }}
          workflowPopover={{
            initialPeople: [],
            initialProjects: [],
            onCancel: () => undefined,
            onProcessComplete: () => undefined,
            triage: {
              anchorElement: root,
              currentTag: "#up",
              item: createTodo("task-1"),
            },
            triageUid: "task-1",
            x: 12,
            y: 18,
          }}
        />,
        root,
      );
    });

    expect(root.textContent).toContain("NextActionsStep");
    expect(root.querySelector("#workflow-process-popover")?.textContent).toContain("task-1");
    expect(root.querySelector("[data-progress='0.5']")).not.toBeNull();
  });

  it("renders tickler schedule chrome and the trigger and dashboard step branches", async () => {
    const { ReviewWizardBody } = await import("../components/review-wizard/ReviewWizardBody");

    await act(async () => {
      ReactDOM.render(
        <ReviewWizardBody
          bodyRef={{ current: null }}
          bodyState={
            { ticklerItems: [{ dailyPageUid: "day-1", dailyTitle: "Day 1", items: [] }] } as never
          }
          bodyStep={{ description: "", key: "tickler", title: "Tickler" }}
          inbox={{
            goBackRef: { current: null },
            isLoading: false,
            items: [],
            onAdvance: () => undefined,
            onAtEndChange: () => undefined,
            onIndexChange: () => undefined,
            onProgressChange: () => undefined,
            settings: TEST_SETTINGS,
            skipItemRef: { current: null },
            store: {} as never,
          }}
          progressValue={0.25}
          projects={{
            detailProjectPageUid: null,
            dismissedUids: new Set(),
            focusRequestUid: null,
            hotkeyBindings: {
              delegate: "d",
              reference: "r",
              someday: "s",
              up: "u",
              watch: "w",
            },
            onCreateProjectTodo: async () => undefined,
            onDismissProject: () => undefined,
            onFocusRequestHandled: () => undefined,
            onOpenProjectDetail: () => undefined,
            onProjectTodoBlur: () => undefined,
            onStatusChange: () => true,
            onTodoHotkeyAction: async () => undefined,
            projects: [],
            projectsHydrated: true,
          }}
          settings={TEST_SETTINGS}
          t={t}
          tickler={{
            activeDetailPageUid: null,
            groups: [
              { dailyPageUid: "day-1", dailyTitle: "Day 1", items: [createTodo("tickler-1")] },
            ],
            itemCount: 1,
            onItemProcessed: () => undefined,
            onOpenDetail: () => undefined,
            onPromoteToNext: () => undefined,
            schedulePopover: {
              canUnset: true,
              initialValue: "Today",
              onCancel: () => undefined,
              onConfirm: async () => undefined,
              onUnset: async () => undefined,
            },
          }}
          workflow={{
            activePersonDetail: null,
            activeTriageUid: null,
            delegatedChildPersonRefs: new Map(),
            delegatedItems: [],
            delegatedPeople: [],
            items: [],
            onItemProcessed: () => undefined,
            onOpenPersonDetail: () => undefined,
            onOpenTriage: () => undefined,
            waitingItems: [],
          }}
          workflowPopover={null}
        />,
        root,
      );
    });

    expect(root.textContent).toContain("ticklerThisMonth:1");
    expect(root.textContent).toContain("TicklerStep");
    expect(root.querySelector("#schedule-popover")).not.toBeNull();

    await act(async () => {
      ReactDOM.render(
        <ReviewWizardBody
          bodyRef={{ current: null }}
          bodyState={{ ticklerItems: [] } as never}
          bodyStep={{ description: "", key: "triggerList", title: "Triggers" }}
          inbox={{
            goBackRef: { current: null },
            isLoading: false,
            items: [],
            onAdvance: () => undefined,
            onAtEndChange: () => undefined,
            onIndexChange: () => undefined,
            onProgressChange: () => undefined,
            settings: TEST_SETTINGS,
            skipItemRef: { current: null },
            store: {} as never,
          }}
          progressValue={0}
          projects={{
            detailProjectPageUid: null,
            dismissedUids: new Set(),
            focusRequestUid: null,
            hotkeyBindings: {
              delegate: "d",
              reference: "r",
              someday: "s",
              up: "u",
              watch: "w",
            },
            onCreateProjectTodo: async () => undefined,
            onDismissProject: () => undefined,
            onFocusRequestHandled: () => undefined,
            onOpenProjectDetail: () => undefined,
            onProjectTodoBlur: () => undefined,
            onStatusChange: () => true,
            onTodoHotkeyAction: async () => undefined,
            projects: [],
            projectsHydrated: true,
          }}
          settings={TEST_SETTINGS}
          t={t}
          tickler={{
            activeDetailPageUid: null,
            groups: [],
            itemCount: 0,
            onItemProcessed: () => undefined,
            onOpenDetail: () => undefined,
            onPromoteToNext: () => undefined,
            schedulePopover: null,
          }}
          workflow={{
            activePersonDetail: null,
            activeTriageUid: null,
            delegatedChildPersonRefs: new Map(),
            delegatedItems: [],
            delegatedPeople: [],
            items: [],
            onItemProcessed: () => undefined,
            onOpenPersonDetail: () => undefined,
            onOpenTriage: () => undefined,
            waitingItems: [],
          }}
          workflowPopover={null}
        />,
        root,
      );
    });

    expect(root.textContent).toContain("TriggersStep");

    await act(async () => {
      ReactDOM.render(
        <ReviewWizardBody
          bodyRef={{ current: null }}
          bodyState={{ ticklerItems: [] } as never}
          bodyStep={{ description: "", key: "stats", title: "Dashboard" }}
          inbox={{
            goBackRef: { current: null },
            isLoading: false,
            items: [],
            onAdvance: () => undefined,
            onAtEndChange: () => undefined,
            onIndexChange: () => undefined,
            onProgressChange: () => undefined,
            settings: TEST_SETTINGS,
            skipItemRef: { current: null },
            store: {} as never,
          }}
          progressValue={0}
          projects={{
            detailProjectPageUid: null,
            dismissedUids: new Set(),
            focusRequestUid: null,
            hotkeyBindings: {
              delegate: "d",
              reference: "r",
              someday: "s",
              up: "u",
              watch: "w",
            },
            onCreateProjectTodo: async () => undefined,
            onDismissProject: () => undefined,
            onFocusRequestHandled: () => undefined,
            onOpenProjectDetail: () => undefined,
            onProjectTodoBlur: () => undefined,
            onStatusChange: () => true,
            onTodoHotkeyAction: async () => undefined,
            projects: [],
            projectsHydrated: true,
          }}
          settings={TEST_SETTINGS}
          t={t}
          tickler={{
            activeDetailPageUid: null,
            groups: [],
            itemCount: 0,
            onItemProcessed: () => undefined,
            onOpenDetail: () => undefined,
            onPromoteToNext: () => undefined,
            schedulePopover: null,
          }}
          workflow={{
            activePersonDetail: null,
            activeTriageUid: null,
            delegatedChildPersonRefs: new Map(),
            delegatedItems: [],
            delegatedPeople: [],
            items: [],
            onItemProcessed: () => undefined,
            onOpenPersonDetail: () => undefined,
            onOpenTriage: () => undefined,
            waitingItems: [],
          }}
          workflowPopover={null}
        />,
        root,
      );
    });

    expect(root.textContent).toContain("DashboardStep");
  });
});
