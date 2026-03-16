import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAgendaTodo: vi.fn(async () => undefined),
  fetchAllPeople: vi.fn(async () => []),
  formatNamespacedPageDisplayTitle: vi.fn((value: string) => value),
  getCurrentDueDateValue: vi.fn(() => ""),
  hasConflict: vi.fn(() => null),
  isGoogleCalendarAvailable: vi.fn(() => true),
  loadTriageProjects: vi.fn(
    async ({ onUpdate }: { onUpdate?: (projects: Array<unknown>) => void } = {}) => {
      const projects: Array<unknown> = [];
      onUpdate?.(projects);
      return projects;
    },
  ),
  runTriageProcess: vi.fn(async () => ({
    nextBlockString: "{{[[TODO]]}} Review block",
    nextTag: "delegated",
    projectHandled: false,
    shouldHide: true,
  })),
  sortPeopleEntries: vi.fn((entries) => entries),
}));

vi.mock("roamjs-components/components/AutocompleteInput", () => ({
  default: ({
    id,
    placeholder,
    setValue,
    value,
  }: {
    id?: string;
    placeholder?: string;
    setValue: (value: string) => void;
    value?: string;
  }) =>
    React.createElement("input", {
      id,
      onChange: (event: Event) => {
        setValue((event.target as HTMLInputElement).value);
      },
      onInput: (event: Event) => {
        setValue((event.target as HTMLInputElement).value);
      },
      placeholder,
      value: value ?? "",
    }),
}));

vi.mock("../google-calendar", () => ({
  fetchEventsForDate: vi.fn(async () => []),
  hasConflict: mocks.hasConflict,
  isGoogleCalendarAvailable: mocks.isGoogleCalendarAvailable,
}));

vi.mock("../people", () => ({
  createAgendaTodo: mocks.createAgendaTodo,
  fetchAllPeople: mocks.fetchAllPeople,
  sortPeopleEntries: mocks.sortPeopleEntries,
}));

vi.mock("../triage/process-engine", () => ({
  runTriageProcess: mocks.runTriageProcess,
}));

vi.mock("../triage/support", () => ({
  buildProjectOptionLookup: (
    projects: Array<{ searchText?: string; title: string; uid: string }>,
  ) => {
    const lookup = new Map<string, { searchText?: string; title: string; uid: string }>();
    for (const project of projects) {
      lookup.set(project.title.toLowerCase(), project);
      if (project.searchText) {
        lookup.set(project.searchText, project);
      }
    }
    return lookup;
  },
  buildProjectSearchTextLookup: (
    projects: Array<{ searchText?: string; title: string; uid: string }>,
  ) =>
    new Map(
      projects.map((project) => [
        project.title,
        [project.title.toLowerCase(), ...(project.searchText ? [project.searchText] : [])],
      ]),
    ),
  filterNamespacedPageOptions: (options: Array<string>) => options,
  filterProjectOptions: (options: Array<string>) => options,
  formatNamespacedPageDisplayTitle: mocks.formatNamespacedPageDisplayTitle,
  invalidateTriageProjectsCache: vi.fn(),
  loadTriageProjects: mocks.loadTriageProjects,
}));

vi.mock("../triage/step-logic", () => ({
  showTriageToast: vi.fn(),
  validateWebhookUrl: vi.fn(() => ""),
}));

vi.mock("../triage/writes", () => ({
  getCurrentDueDateValue: mocks.getCurrentDueDateValue,
}));

vi.mock("../components/SchedulePopover", () => ({
  CALENDAR_BUTTON_ID: "roam-gtd-calendar-button",
  SCHEDULE_POPOVER_ID: "roam-gtd-schedule-popover",
  SchedulePopover: ({
    onConfirm,
  }: {
    onConfirm: (intent: {
      date: Date;
      googleCalendarAccount: string | null;
      roamDate: string;
      time: string;
    }) => void;
  }) =>
    React.createElement(
      "button",
      {
        id: "schedule-confirm",
        onClick: () =>
          onConfirm({
            date: new Date(2026, 1, 25, 9, 30),
            googleCalendarAccount: "Work Calendar",
            roamDate: "February 25th, 2026",
            time: "09:30",
          }),
        type: "button",
      },
      "confirm schedule",
    ),
}));

import { WorkflowProcessPopover } from "../components/WorkflowProcessPopover";
import { CALENDAR_BUTTON_ID, DELEGATE_AUTOCOMPLETE_ID } from "../triage/form-helpers";
import { TEST_SETTINGS } from "./fixtures";

const settings = {
  ...TEST_SETTINGS,
  showTooltips: false,
};

function t(key: string): string {
  return key;
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("WorkflowProcessPopover", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;
  let onProcessComplete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    dom = new JSDOM("<div id='root'></div>");
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    onProcessComplete = vi.fn();

    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Node", dom.window.Node);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      dom.window.setTimeout(() => callback(0), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => dom.window.clearTimeout(handle));
    Object.assign(globalThis.window, {
      cancelAnimationFrame: globalThis.cancelAnimationFrame,
      requestAnimationFrame: globalThis.requestAnimationFrame,
      roamAlphaAPI: {
        data: {
          pull: vi.fn(() => ({ ":block/string": "{{[[TODO]]}} Review block" })),
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

  async function renderPopover(currentTag = "watch"): Promise<void> {
    act(() => {
      ReactDOM.render(
        React.createElement(WorkflowProcessPopover, {
          currentTag,
          isOpen: true,
          onCancel: vi.fn(),
          onProcessComplete,
          settings,
          t,
          targetText: "{{[[TODO]]}} Review block",
          targetUid: "todo-uid",
        }),
        root,
      );
    });

    await flush();
  }

  function getSubmitButton(): HTMLButtonElement {
    const button = root.querySelector(".bp3-intent-primary") as HTMLButtonElement | null;
    if (!button) {
      throw new Error("Missing submit button");
    }
    return button;
  }

  it("passes the current form state into the shared triage process engine", async () => {
    await renderPopover();

    const delegateInput = root.querySelector(`#${DELEGATE_AUTOCOMPLETE_ID}`) as HTMLInputElement;
    act(() => {
      delegateInput.value = "Alice";
      delegateInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });

    const calendarButton = root.querySelector(`#${CALENDAR_BUTTON_ID}`) as HTMLButtonElement;
    act(() => {
      calendarButton.click();
    });

    const confirmScheduleButton = root.querySelector("#schedule-confirm") as HTMLButtonElement;
    await act(async () => {
      confirmScheduleButton.click();
      await Promise.resolve();
    });

    await act(async () => {
      getSubmitButton().click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.runTriageProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        currentTag: "watch",
        formState: expect.objectContaining({
          delegateValue: "Alice",
          scheduleIntent: expect.objectContaining({
            googleCalendarAccount: "Work Calendar",
            roamDate: "February 25th, 2026",
            time: "09:30",
          }),
        }),
        item: {
          text: "{{[[TODO]]}} Review block",
          uid: "todo-uid",
        },
      }),
    );
    expect(onProcessComplete).toHaveBeenCalledWith("todo-uid", true);
  });

  it("does not re-enter processing while the shared engine promise is still pending", async () => {
    let resolveProcess: (() => void) | null = null;
    mocks.runTriageProcess.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveProcess = () =>
          resolve({
            nextBlockString: "{{[[TODO]]}} Review block",
            nextTag: "watch",
            projectHandled: false,
            shouldHide: false,
          });
      }),
    );

    await renderPopover();

    await act(async () => {
      getSubmitButton().click();
      getSubmitButton().click();
      await Promise.resolve();
    });

    expect(mocks.runTriageProcess).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveProcess?.();
      await Promise.resolve();
    });

    expect(onProcessComplete).toHaveBeenCalledWith("todo-uid", false);
  });
});
