import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InboxZeroStep } from "../components/InboxZeroStep";
import { createTriageInputService } from "../review/session/triage-input-service";
import type { createGtdStore } from "../store";
import type { TodoItem } from "../types";
import { TEST_SETTINGS } from "./fixtures";

const mocks = vi.hoisted(() => ({
  appendTag: vi.fn(async () => undefined),
  clearDueDateChild: vi.fn(async () => []),
  createAgendaReference: vi.fn(async () => undefined),
  createAgendaTodo: vi.fn(async () => undefined),
  createEvent: vi.fn(async () => undefined),
  createProjectFromTemplateAndTeleportTodo: vi.fn(async () => undefined),
  fetchActiveProjects: vi.fn(async () => []),
  fetchAllPeople: vi.fn(async () => []),
  fetchAllProjects: vi.fn(async () => []),
  fetchEventsForDate: vi.fn(async () => []),
  findPeopleInText: vi.fn(() => []),
  formatCalendarEventSummary: vi.fn((value: string) => value),
  getCurrentDueDateValue: vi.fn(() => ""),
  getOrCreatePersonPage: vi.fn(async (title: string) => ({ title, uid: `person-${title}` })),
  hasConflict: vi.fn(() => null),
  isGoogleCalendarAvailable: vi.fn(() => false),
  loadTriageProjects: vi.fn(
    async ({ onUpdate }: { onUpdate?: (projects: Array<unknown>) => void } = {}) => {
      const projects: Array<unknown> = [];
      onUpdate?.(projects);
      return projects;
    },
  ),
  markDone: vi.fn(async () => undefined),
  pageHasTag: vi.fn(() => false),
  primePageTitleSearchSupport: vi.fn(async () => undefined),
  reactivateProjectStatusIfInactive: vi.fn(async () => false),
  removeHashTagForms: vi.fn((value: string) => value),
  removeTodoMarker: vi.fn(async () => undefined),
  replaceTag: vi.fn(
    async (_uid: string, _page: string, _tag: string, _sourceText: string) => undefined,
  ),
  replaceTags: vi.fn(
    async (_uid: string, _pages: Array<string>, _tag: string, _sourceText: string) => undefined,
  ),
  searchPagesAsync: vi.fn(async () => []),
  showToast: vi.fn(),
  syncDelegatedAgendaEntry: vi.fn(async () => undefined),
  teleportBlockToProject: vi.fn(async () => undefined),
  upsertContextChild: vi.fn(async () => undefined),
  upsertDueDateChild: vi.fn(async () => []),
  weeklyReviewBlockDeferreds: new Map<string, { promise: Promise<void>; resolve: () => void }>(),
}));

function noop(): void {
  return undefined;
}

function assignContainerRef(
  containerRef: React.Ref<HTMLDivElement | null> | undefined,
  node: HTMLDivElement | null,
): void {
  if (!containerRef) {
    return;
  }
  if (typeof containerRef === "function") {
    containerRef(node);
    return;
  }
  (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
}

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

vi.mock("../contexts", () => ({
  primePageTitleSearchSupport: mocks.primePageTitleSearchSupport,
  searchPagesAsync: mocks.searchPagesAsync,
}));

vi.mock("../google-calendar", () => ({
  createEvent: mocks.createEvent,
  fetchEventsForDate: mocks.fetchEventsForDate,
  formatCalendarEventSummary: mocks.formatCalendarEventSummary,
  hasConflict: mocks.hasConflict,
  isGoogleCalendarAvailable: mocks.isGoogleCalendarAvailable,
}));

vi.mock("../people", () => ({
  createAgendaReference: mocks.createAgendaReference,
  createAgendaTodo: mocks.createAgendaTodo,
  fetchAllPeople: mocks.fetchAllPeople,
  findPeopleInText: mocks.findPeopleInText,
  getOrCreatePersonPage: mocks.getOrCreatePersonPage,
  pageHasTag: mocks.pageHasTag,
  sortPeopleEntries: <T>(entries: Array<T>) => entries,
  syncDelegatedAgendaEntry: mocks.syncDelegatedAgendaEntry,
}));

vi.mock("../review/actions", () => ({
  appendTag: mocks.appendTag,
  markDone: mocks.markDone,
  removeHashTagForms: mocks.removeHashTagForms,
  removeTodoMarker: mocks.removeTodoMarker,
  replaceTag: mocks.replaceTag,
  replaceTags: mocks.replaceTags,
}));

vi.mock("../teleport", () => ({
  createProjectFromTemplateAndTeleportTodo: mocks.createProjectFromTemplateAndTeleportTodo,
  fetchActiveProjects: mocks.fetchActiveProjects,
  fetchAllProjects: mocks.fetchAllProjects,
  reactivateProjectStatusIfInactive: mocks.reactivateProjectStatusIfInactive,
  teleportBlockToProject: mocks.teleportBlockToProject,
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
  formatNamespacedPageDisplayTitle: (value: string) => value,
  getProjectOptionsFromSummaries: (projects: Array<{ pageTitle: string; pageUid: string }>) =>
    projects.map((project) => ({
      searchText: project.pageTitle,
      title: project.pageTitle,
      uid: project.pageUid,
    })),
  invalidateTriageProjectsCache: vi.fn(),
  loadTriageProjects: mocks.loadTriageProjects,
}));

vi.mock("../triage/writes", () => ({
  clearDueDateChild: mocks.clearDueDateChild,
  getCurrentDueDateValue: mocks.getCurrentDueDateValue,
  upsertContextChild: mocks.upsertContextChild,
  upsertDueDateChild: mocks.upsertDueDateChild,
}));

vi.mock("../components/SchedulePopover", () => ({
  SCHEDULE_POPOVER_ID: "roam-gtd-schedule-popover",
  SchedulePopover: ({
    onConfirm,
  }: {
    onConfirm: (intent: {
      date: Date;
      googleCalendarAccount: string | null;
      roamDate: string;
      time?: string;
    }) => void;
  }) =>
    React.createElement(
      "div",
      { id: "roam-gtd-schedule-popover" },
      React.createElement(
        "button",
        {
          id: "schedule-confirm-timed",
          onClick: () =>
            onConfirm({
              date: new Date("2026-03-12T15:30:00.000Z"),
              googleCalendarAccount: null,
              roamDate: "March 12th, 2026",
              time: "3:30 PM",
            }),
          type: "button",
        },
        "confirm timed schedule",
      ),
    ),
}));

vi.mock("../components/WeeklyReviewRoamBlock", () => {
  const WeeklyReviewRoamBlock = React.forwardRef<
    {
      cancelPendingFocus: () => void;
      focusEditor: () => boolean;
      getContainer: () => HTMLDivElement | null;
    },
    {
      containerRef?: React.Ref<HTMLDivElement | null>;
      loadingPlaceholderMode?: "always" | "initial-only" | "never";
      preservePreviousContentOnUidChange?: boolean;
      uid: string;
    }
  >(({ containerRef, loadingPlaceholderMode, preservePreviousContentOnUidChange, uid }, ref) => {
    const [displayedUid, setDisplayedUid] = React.useState(uid);

    React.useImperativeHandle(ref, () => ({
      cancelPendingFocus: () => undefined,
      focusEditor: () => {
        const node = document.querySelector<HTMLDivElement>(
          `[data-testid='weekly-review-block'][data-uid='${displayedUid}']`,
        );
        node?.focus();
        return Boolean(node);
      },
      getContainer: () =>
        document.querySelector<HTMLDivElement>(
          `[data-testid='weekly-review-block'][data-uid='${displayedUid}']`,
        ),
    }));

    React.useEffect(() => {
      let active = true;
      const deferredRender = mocks.weeklyReviewBlockDeferreds.get(uid);
      if (!deferredRender) {
        setDisplayedUid(uid);
        return;
      }
      void deferredRender.promise.then(() => {
        if (!active) {
          return;
        }
        setDisplayedUid(uid);
      });
      return () => {
        active = false;
      };
    }, [uid]);

    React.useEffect(() => {
      assignContainerRef(
        containerRef,
        document.querySelector<HTMLDivElement>(
          `[data-testid='weekly-review-block'][data-uid='${displayedUid}']`,
        ),
      );
      return () => {
        assignContainerRef(containerRef, null);
      };
    }, [containerRef, displayedUid]);

    return React.createElement(
      "div",
      {
        "data-loading-placeholder-mode": loadingPlaceholderMode,
        "data-preserve-previous-content": preservePreviousContentOnUidChange ? "true" : "false",
        "data-testid": "weekly-review-block",
        "data-uid": displayedUid,
        tabIndex: -1,
      },
      displayedUid,
    );
  });
  WeeklyReviewRoamBlock.displayName = "MockInboxZeroRoamBlock";

  return {
    isWeeklyReviewBlockEditorElement: vi.fn(() => false),
    WeeklyReviewRoamBlock,
  };
});

type GtdStore = ReturnType<typeof createGtdStore>;

const BASE_ITEM: TodoItem = {
  ageDays: 0,
  createdTime: 0,
  deferredDate: null,
  pageTitle: "Inbox",
  text: "{{[[TODO]]}} Review release packaging",
  uid: "todo-1",
};

function t(key: string): string {
  return key;
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = noop;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createStore(): GtdStore {
  return {
    getSnapshot: vi.fn(() => ({ projects: [] })),
    refresh: vi.fn(),
    scheduleRefresh: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  } as unknown as GtdStore;
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("InboxZeroStep orchestration", () => {
  let blocks: Map<string, string>;
  let dom: JSDOM;
  let root: HTMLDivElement;
  let store: GtdStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.weeklyReviewBlockDeferreds.clear();
    blocks = new Map([[BASE_ITEM.uid, BASE_ITEM.text]]);
    dom = new JSDOM("<div class='roam-gtd-review-dialog'><div id='root'></div></div>", {
      url: "https://example.com",
    });
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    store = createStore();

    Object.defineProperty(dom.window.HTMLElement.prototype, "getClientRects", {
      configurable: true,
      value() {
        return [{ height: 20, width: 120, x: 0, y: 0 }];
      },
    });
    Object.defineProperty(dom.window.HTMLElement.prototype, "attachEvent", {
      configurable: true,
      value() {
        return undefined;
      },
    });
    Object.defineProperty(dom.window.HTMLElement.prototype, "detachEvent", {
      configurable: true,
      value() {
        return undefined;
      },
    });
    Object.defineProperty(dom.window.HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value() {
        return undefined;
      },
    });

    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("Element", dom.window.Element);
    vi.stubGlobal("Event", dom.window.Event);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("HTMLInputElement", dom.window.HTMLInputElement);
    vi.stubGlobal("KeyboardEvent", dom.window.KeyboardEvent);
    vi.stubGlobal("MouseEvent", dom.window.MouseEvent);
    vi.stubGlobal("Node", dom.window.Node);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      dom.window.setTimeout(() => callback(0), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => dom.window.clearTimeout(handle));
    Object.assign(globalThis.window, {
      Blueprint: {
        Core: {
          Position: {
            TOP: "top",
          },
          Toaster: {
            create: () => ({
              show: mocks.showToast,
            }),
          },
        },
      },
      cancelAnimationFrame: globalThis.cancelAnimationFrame,
      requestAnimationFrame: globalThis.requestAnimationFrame,
      roamAlphaAPI: {
        data: {
          pull: vi.fn((pattern: string, [_attr, uid]: [string, string]) => {
            if (pattern === "[:block/uid]") {
              return blocks.has(uid) ? { ":block/uid": uid } : null;
            }
            if (pattern === "[:block/string]") {
              const text = blocks.get(uid);
              return typeof text === "string" ? { ":block/string": text } : null;
            }
            return null;
          }),
        },
        updateBlock: vi.fn(async () => undefined),
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

  async function renderStep(
    items: Array<TodoItem> = [BASE_ITEM],
    overrides: Partial<React.ComponentProps<typeof InboxZeroStep>> = {},
  ): Promise<React.ComponentProps<typeof InboxZeroStep>> {
    const props: React.ComponentProps<typeof InboxZeroStep> = {
      goBackRef: { current: null },
      isLoading: false,
      items,
      onAdvance: vi.fn(),
      settings: TEST_SETTINGS,
      skipItemRef: { current: null },
      store,
      t,
      ...overrides,
    };

    await act(async () => {
      ReactDOM.render(React.createElement(InboxZeroStep, props), root);
    });

    await flush();
    await flush();

    return props;
  }

  it("opens the delegate prompt and focuses its input when the delegate hotkey fires", async () => {
    await renderStep();

    const handleShortcut = (
      globalThis.window as Window & {
        __roamGtdHandleInboxShortcut?: (action: "delegate") => boolean;
      }
    ).__roamGtdHandleInboxShortcut;

    expect(handleShortcut).toBeTypeOf("function");

    await act(async () => {
      expect(handleShortcut?.("delegate")).toBe(true);
    });

    await flush();

    const promptInput = root.querySelector(".bp3-card input") as HTMLInputElement | null;
    expect(promptInput).not.toBeNull();
    expect(dom.window.document.activeElement).toBe(promptInput);
  });

  it("renders the extracted empty state when the inbox is clear", async () => {
    await renderStep([]);

    expect(root.textContent).toContain("allClearTitle");
    expect(root.textContent).toContain("step1Desc");
  });

  it("replays a pending inbox shortcut through the extracted hotkey registration", async () => {
    (
      globalThis.window as Window & {
        __roamGtdPendingInboxShortcut?: "delegate" | null;
      }
    ).__roamGtdPendingInboxShortcut = "delegate";

    await renderStep();

    const promptInput = root.querySelector(".bp3-card input") as HTMLInputElement | null;
    expect(promptInput).not.toBeNull();
    expect(dom.window.document.activeElement).toBe(promptInput);
    expect(
      (
        globalThis.window as Window & {
          __roamGtdPendingInboxShortcut?: "delegate" | null;
        }
      ).__roamGtdPendingInboxShortcut,
    ).toBeNull();
  });

  it("warms triage providers from step 1 after first paint", async () => {
    const triageService = createTriageInputService({
      settings: TEST_SETTINGS,
      store,
    });
    const ensureWarm = vi.spyOn(triageService, "ensureWarm");

    await renderStep([BASE_ITEM], {
      triageService,
    });

    await flush();

    expect(ensureWarm).toHaveBeenCalledWith("context");
    expect(ensureWarm).toHaveBeenCalledWith("people");
    expect(ensureWarm).toHaveBeenCalledWith("project");
  });

  it("uses key-based remounting for the Step 1 embed", async () => {
    await renderStep();

    const block = root.querySelector(
      "[data-testid='weekly-review-block']",
    ) as HTMLDivElement | null;

    expect(block).not.toBeNull();
    // preservePreviousContentOnUidChange keeps old embed visible while the new one renders;
    // initial-only shows skeleton only on first boot, not on subsequent item changes.
    expect(block?.dataset.loadingPlaceholderMode).toBe("initial-only");
    expect(block?.dataset.preservePreviousContent).toBe("true");
  });

  it("remounts the embed with the new uid after advancing", async () => {
    const nextItem: TodoItem = {
      ...BASE_ITEM,
      text: "{{[[TODO]]}} Confirm release notes",
      uid: "todo-2",
    };
    blocks.set(nextItem.uid, nextItem.text);

    await renderStep([BASE_ITEM, nextItem]);

    expect(
      root.querySelector("[data-testid='weekly-review-block']")?.getAttribute("data-uid"),
    ).toBe(BASE_ITEM.uid);

    const handleShortcut = (
      globalThis.window as Window & {
        __roamGtdHandleInboxShortcut?: (action: "up") => boolean;
      }
    ).__roamGtdHandleInboxShortcut;

    await act(async () => {
      expect(handleShortcut?.("up")).toBe(true);
    });
    await flush();

    expect(root.textContent).toContain("2 of 2");
    // Block updates uid immediately when no deferred render is pending
    expect(
      root.querySelector("[data-testid='weekly-review-block']")?.getAttribute("data-uid"),
    ).toBe(nextItem.uid);
  });

  it("preserves previous block content until the next block render resolves", async () => {
    const nextItem: TodoItem = {
      ...BASE_ITEM,
      text: "{{[[TODO]]}} Confirm release notes",
      uid: "todo-2",
    };
    const deferredRender = createDeferred();
    blocks.set(nextItem.uid, nextItem.text);
    mocks.weeklyReviewBlockDeferreds.set(nextItem.uid, deferredRender);

    const props = await renderStep([BASE_ITEM, nextItem]);

    expect(
      root.querySelector("[data-testid='weekly-review-block']")?.getAttribute("data-uid"),
    ).toBe(BASE_ITEM.uid);

    await act(async () => {
      props.skipItemRef?.current?.();
    });
    await flush();

    expect(root.textContent).toContain("2 of 2");
    // Previous content preserved while new block render is deferred
    expect(
      root.querySelector("[data-testid='weekly-review-block']")?.getAttribute("data-uid"),
    ).toBe(BASE_ITEM.uid);

    deferredRender.resolve();
    await flush();

    // After deferred resolves, the new block content is displayed
    expect(
      root.querySelector("[data-testid='weekly-review-block']")?.getAttribute("data-uid"),
    ).toBe(nextItem.uid);
  });

  it("re-enters back-view for the processed snapshot after refresh removes the live item", async () => {
    const nextItem: TodoItem = {
      ...BASE_ITEM,
      text: "{{[[TODO]]}} Schedule ship date",
      uid: "todo-2",
    };
    blocks.set(nextItem.uid, nextItem.text);

    const props = await renderStep([BASE_ITEM, nextItem]);
    const handleShortcut = (
      globalThis.window as Window & {
        __roamGtdHandleInboxShortcut?: (action: "up") => boolean;
      }
    ).__roamGtdHandleInboxShortcut;

    expect(handleShortcut).toBeTypeOf("function");

    await act(async () => {
      expect(handleShortcut?.("up")).toBe(true);
    });
    await flush();

    expect(root.textContent).toContain("todo-2");

    await renderStep([nextItem], {
      goBackRef: props.goBackRef,
      onAdvance: props.onAdvance,
      skipItemRef: props.skipItemRef,
    });

    await act(async () => {
      props.goBackRef?.current?.();
    });
    await flush();

    expect(root.textContent).toContain("todo-1");
  });

  it("serializes rapid workflow writes so the second item waits for the first to finish", async () => {
    const firstWrite = createDeferred();
    const secondWrite = createDeferred();
    const nextItem: TodoItem = {
      ...BASE_ITEM,
      text: "{{[[TODO]]}} Capture design QA",
      uid: "todo-2",
    };
    blocks.set(nextItem.uid, nextItem.text);
    mocks.replaceTag.mockImplementation((uid: string) => {
      if (uid === BASE_ITEM.uid) {
        return firstWrite.promise.then(() => undefined);
      }
      if (uid === nextItem.uid) {
        return secondWrite.promise.then(() => undefined);
      }
      return Promise.resolve(undefined);
    });

    await renderStep([BASE_ITEM, nextItem]);
    const handleShortcut = (
      globalThis.window as Window & {
        __roamGtdHandleInboxShortcut?: (action: "up") => boolean;
      }
    ).__roamGtdHandleInboxShortcut;

    expect(handleShortcut).toBeTypeOf("function");

    await act(async () => {
      expect(handleShortcut?.("up")).toBe(true);
    });
    await flush();

    expect(root.textContent).toContain("todo-2");
    expect(mocks.replaceTag).toHaveBeenCalledTimes(1);
    expect(mocks.replaceTag).toHaveBeenLastCalledWith(
      "todo-1",
      TEST_SETTINGS.inboxPage,
      TEST_SETTINGS.tagNextAction,
      BASE_ITEM.text,
    );

    await act(async () => {
      expect(handleShortcut?.("up")).toBe(true);
    });
    await flush();

    expect(mocks.replaceTag).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain("2 of 2");

    firstWrite.resolve();
    await flush();

    expect(mocks.replaceTag).toHaveBeenCalledTimes(2);
    expect(mocks.replaceTag).toHaveBeenLastCalledWith(
      "todo-2",
      TEST_SETTINGS.inboxPage,
      TEST_SETTINGS.tagNextAction,
      nextItem.text,
    );

    secondWrite.resolve();
    await flush();

    expect(store.scheduleRefresh).toHaveBeenCalledTimes(2);
  });

  it("submits a freeform project from the process button and advances before async project creation finishes", async () => {
    const nextItem: TodoItem = {
      ...BASE_ITEM,
      text: "{{[[TODO]]}} Ship release notes",
      uid: "todo-2",
    };
    blocks.set(nextItem.uid, nextItem.text);

    await renderStep([BASE_ITEM, nextItem]);

    const projectInput = root.querySelector("#gtd-project-autocomplete") as HTMLInputElement | null;
    expect(projectInput).not.toBeNull();

    await act(async () => {
      projectInput!.value = "Project:: Public launch";
      projectInput!.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });

    const processButton = Array.from(root.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("submit"),
    ) as HTMLButtonElement | undefined;
    expect(processButton).toBeDefined();

    await act(async () => {
      processButton?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });

    expect(root.textContent).toContain("todo-2");

    await flush();
    await flush();
    await flush();

    expect(mocks.createProjectFromTemplateAndTeleportTodo).toHaveBeenCalledWith(
      "todo-1",
      "Project:: Public launch",
    );
    expect(store.scheduleRefresh).toHaveBeenCalledWith(TEST_SETTINGS, 300, {
      scope: "inboxOnly",
    });
  });

  it("keeps the due-date write when a scheduled watch submit cannot create a calendar event", async () => {
    const watchItem: TodoItem = {
      ...BASE_ITEM,
      text: "{{[[TODO]]}} Review launch timeline #[[watch]]",
      uid: "todo-watch",
    };
    const nextItem: TodoItem = {
      ...BASE_ITEM,
      text: "{{[[TODO]]}} Review launch retro",
      uid: "todo-2",
    };
    blocks.set(watchItem.uid, watchItem.text);
    blocks.set(nextItem.uid, nextItem.text);
    mocks.isGoogleCalendarAvailable.mockReturnValue(true);
    mocks.createEvent.mockRejectedValueOnce(new Error("calendar down"));

    await renderStep([watchItem, nextItem]);

    const calendarButton = root.querySelector("#gtd-calendar-button") as HTMLButtonElement | null;
    expect(calendarButton).not.toBeNull();

    await act(async () => {
      calendarButton?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const confirmTimedSchedule = root.querySelector(
      "#schedule-confirm-timed",
    ) as HTMLButtonElement | null;
    expect(confirmTimedSchedule).not.toBeNull();

    await act(async () => {
      confirmTimedSchedule?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const processButton = Array.from(root.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("submit"),
    ) as HTMLButtonElement | undefined;
    expect(processButton).toBeDefined();

    await act(async () => {
      processButton?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });

    expect(root.textContent).toContain("todo-2");

    await flush();
    await flush();
    await flush();

    expect(mocks.upsertDueDateChild).toHaveBeenCalledWith(
      "todo-watch",
      "March 12th, 2026",
      expect.any(Function),
      undefined,
    );
    expect(mocks.createEvent).toHaveBeenCalledWith(
      watchItem.text,
      "todo-watch",
      new Date("2026-03-12T15:30:00.000Z"),
      10,
      null,
    );
    expect(mocks.showToast).toHaveBeenCalledWith({
      intent: "warning",
      message: "scheduleGcalUnavailable",
      timeout: 2500,
    });
  });
});
