import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectTitlePreview } from "../components/projects-step/ProjectTitlePreview";
import { ProjectsStep } from "../components/ProjectsStep";
import type { ProjectSummary } from "../types";

const mocks = vi.hoisted(() => ({
  executeQuery: vi.fn(async () => []),
  scheduleIdleTask: vi.fn((callback: () => void) => {
    callback();
    return () => undefined;
  }),
  syncPageColorBridge: vi.fn(),
}));

function asHtmlElement(value: EventTarget | null): HTMLElement | null {
  if (value == null || typeof value !== "object" || !("nodeType" in value)) {
    return null;
  }
  return (value as Node).nodeType === 1 ? (value as HTMLElement) : null;
}

function isWeeklyReviewEditableElement(element: Element | null): element is HTMLElement {
  return Boolean(
    element &&
    (element.tagName === "INPUT" ||
      element.tagName === "TEXTAREA" ||
      (element as HTMLElement).isContentEditable),
  );
}

vi.mock("../browser-idle", () => ({
  scheduleIdleTask: mocks.scheduleIdleTask,
}));

vi.mock("../data", () => ({
  executeQuery: mocks.executeQuery,
}));

vi.mock("../components/PageColorBridge", () => ({
  syncPageColorBridge: mocks.syncPageColorBridge,
}));

vi.mock("../components/StepEmptyState", () => ({
  StepEmptyState: ({ subtitle, title }: { subtitle?: string; title: string }) =>
    React.createElement("div", null, title, subtitle ? ` ${subtitle}` : ""),
}));

vi.mock("../components/WeeklyReviewNativeBlock", () => ({
  WeeklyReviewNativeBlock: ({ uid }: { uid: string }) =>
    React.createElement("div", { "data-testid": "project-detail-block", "data-uid": uid }, uid),
}));

vi.mock("../components/WeeklyReviewRoamBlock", () => {
  const WeeklyReviewRoamBlock = React.forwardRef<
    {
      cancelPendingFocus: () => void;
      focusEditor: () => boolean;
      getContainer: () => HTMLDivElement | null;
    },
    { onBlurOutside?: (uid: string) => void; uid: string }
  >(({ uid }, ref) => {
    React.useImperativeHandle(ref, () => ({
      cancelPendingFocus: () => undefined,
      focusEditor: () => {
        const node = document.querySelector<HTMLDivElement>(
          `[data-testid='project-todo-block'][data-uid='${uid}']`,
        );
        node?.focus();
        return Boolean(node);
      },
      getContainer: () =>
        document.querySelector<HTMLDivElement>(
          `[data-testid='project-todo-block'][data-uid='${uid}']`,
        ),
    }));
    return React.createElement(
      "div",
      { "data-testid": "project-todo-block", "data-uid": uid, tabIndex: -1 },
      uid,
    );
  });
  WeeklyReviewRoamBlock.displayName = "MockProjectsReviewRoamBlock";

  return {
    asHtmlElement,
    isWeeklyReviewEditableElement,
    WeeklyReviewRoamBlock,
  };
});

const HOTKEY_BINDINGS = {
  delegate: "d",
  reference: "r",
  someday: "s",
  up: "u",
  watch: "w",
} as const;

const t = vi.fn((key: string, ...args: Array<string | number>): string => {
  if (key === "projectsInProgress") {
    return `${args[0]} of ${args[1]} in progress`;
  }
  if (key === "projectsReviewed") {
    return `${args[0]} of ${args[1]} reviewed`;
  }
  return key;
});

function makeProject(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    doneCount: 0,
    lastDoneTime: null,
    lastTodoCreatedTime: 1,
    lastTodoText: "{{[[TODO]]}} Project todo",
    lastTodoUid: "todo-1",
    pageTitle: "Project:: Launch release",
    pageUid: "project-1",
    statusBlockUid: null,
    statusText: null,
    todoCount: 1,
    todoListUid: "list-1",
    totalCount: 1,
    ...overrides,
  };
}

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

describe("ProjectsStep orchestration", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    dom = new JSDOM("<div id='root'></div>", { url: "https://example.com" });
    root = dom.window.document.getElementById("root") as HTMLDivElement;

    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("Element", dom.window.Element);
    vi.stubGlobal("Event", dom.window.Event);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("KeyboardEvent", dom.window.KeyboardEvent);
    vi.stubGlobal("MouseEvent", dom.window.MouseEvent);
    vi.stubGlobal("Node", dom.window.Node);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      dom.window.setTimeout(() => callback(0), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => dom.window.clearTimeout(handle));
    Object.assign(globalThis.window, {
      cancelAnimationFrame: globalThis.cancelAnimationFrame,
      requestAnimationFrame: globalThis.requestAnimationFrame,
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
    projects: Array<ProjectSummary>,
    overrides: Partial<React.ComponentProps<typeof ProjectsStep>> = {},
  ): Promise<React.ComponentProps<typeof ProjectsStep>> {
    const props: React.ComponentProps<typeof ProjectsStep> = {
      detailProjectPageUid: null,
      dismissedUids: new Set(),
      focusRequestUid: null,
      hotkeyBindings: HOTKEY_BINDINGS,
      onCreateProjectTodo: vi.fn(async () => undefined),
      onDismissProject: vi.fn(),
      onFocusRequestHandled: vi.fn(),
      onOpenProjectDetail: vi.fn(),
      onProjectTodoBlur: vi.fn(),
      onStatusChange: vi.fn(() => true),
      onTodoHotkeyAction: vi.fn(async () => undefined),
      projects,
      projectsHydrated: true,
      t,
      ...overrides,
    };

    await act(async () => {
      ReactDOM.render(React.createElement(ProjectsStep, props), root);
    });
    await flush();
    await flush();

    return props;
  }

  it("shows the in-progress copy in the project counter", async () => {
    await renderStep([makeProject()]);

    expect(root.textContent).toContain("1 of 1 in progress");
    expect(t).toHaveBeenCalledWith("projectsInProgress", 1, 1);
    expect(mocks.syncPageColorBridge).toHaveBeenCalledTimes(1);

    const counter = root.querySelector(
      "[data-testid='projects-review-counter']",
    ) as HTMLParagraphElement | null;
    expect(counter).not.toBeNull();

    const segments = Array.from(counter?.children ?? []) as Array<HTMLElement>;
    expect(segments).toHaveLength(2);
    expect(segments[0]?.textContent).toBe("1");
    expect(segments[0]?.style.color).toBe("rgb(148, 226, 213)");
    expect(segments[1]?.textContent).toBe(" of 1 in progress");
    expect(segments[1]?.style.color).toBe("rgb(165, 165, 165)");
  });

  it("renders page refs through the shared project title preview component", async () => {
    await act(async () => {
      ReactDOM.render(
        React.createElement(ProjectTitlePreview, {
          source: "[[2021]] [[work/Expenses]] from [[ExampleCorp]]",
        }),
        root,
      );
    });

    const refs = Array.from(root.querySelectorAll(".rm-page-ref")).map((node) => node.textContent);
    expect(refs).toEqual(["2021", "Expenses", "ExampleCorp"]);
    expect(root.querySelector(".rm-page-ref--namespace")?.textContent).toBe("Expenses");
  });

  it("opens the project detail pane and restores the project list view when detail closes", async () => {
    const project = makeProject();
    const props = await renderStep([project]);

    const previewButton = root.querySelector(
      ".gtd-project-preview-button",
    ) as HTMLButtonElement | null;
    expect(previewButton).not.toBeNull();

    act(() => {
      previewButton?.click();
    });

    expect(props.onOpenProjectDetail).toHaveBeenCalledWith(project);

    await renderStep([project], {
      detailProjectPageUid: project.pageUid,
      onOpenProjectDetail: props.onOpenProjectDetail,
    });
    await flush(140);

    const detailBlock = root.querySelector(
      "[data-testid='project-detail-block']",
    ) as HTMLDivElement | null;
    expect(detailBlock?.dataset.uid).toBe(project.pageUid);
    expect(root.querySelector("[aria-hidden='true']")).not.toBeNull();

    await renderStep([project], {
      detailProjectPageUid: null,
      onOpenProjectDetail: props.onOpenProjectDetail,
    });
    await flush();

    expect(root.querySelector("[data-testid='project-detail-block']")).toBeNull();
    const restoredPreviewButton = root.querySelector(
      ".gtd-project-preview-button",
    ) as HTMLButtonElement | null;
    expect(restoredPreviewButton).not.toBeNull();
    expect(dom.window.document.activeElement).toBe(restoredPreviewButton);
  });

  it("dismisses the top project and keeps the next project mounted after parent state updates", async () => {
    const firstProject = makeProject();
    const secondProject = makeProject({
      lastTodoUid: "todo-2",
      pageTitle: "Project:: Document release notes",
      pageUid: "project-2",
      todoListUid: "list-2",
    });
    const props = await renderStep([firstProject, secondProject]);

    const dismissButton = root.querySelector(
      ".bp3-icon-small-tick.gtd-project-top-control",
    ) as HTMLButtonElement | null;
    expect(dismissButton).not.toBeNull();

    act(() => {
      dismissButton?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });

    expect(props.onDismissProject).toHaveBeenCalledWith(firstProject);

    await renderStep([firstProject, secondProject], {
      dismissedUids: new Set([firstProject.pageUid]),
      onDismissProject: props.onDismissProject,
    });

    expect(root.textContent).not.toContain(firstProject.pageTitle);
    expect(root.textContent).toContain(secondProject.pageTitle.replace(/^Project::\s*/i, ""));
    expect(root.querySelector("[data-testid='project-todo-block']")?.getAttribute("data-uid")).toBe(
      secondProject.lastTodoUid,
    );
  });

  it("routes project todo hotkeys to the callback for the active top project", async () => {
    const project = makeProject();
    const props = await renderStep([project]);

    const cases = [
      { action: "watch", key: HOTKEY_BINDINGS.watch },
      { action: "delegate", key: HOTKEY_BINDINGS.delegate },
      { action: "someday", key: HOTKEY_BINDINGS.someday },
      { action: "up", key: HOTKEY_BINDINGS.up },
      { action: "reference", key: HOTKEY_BINDINGS.reference! },
    ] as const;

    for (const testCase of cases) {
      await act(async () => {
        dom.window.dispatchEvent(
          new dom.window.KeyboardEvent("keydown", { bubbles: true, key: testCase.key }),
        );
      });
    }

    expect(props.onTodoHotkeyAction).toHaveBeenCalledTimes(cases.length);
    const onTodoHotkeyActionMock = props.onTodoHotkeyAction as unknown as {
      mock: { calls: Array<[string, ProjectSummary]> };
    };
    expect(onTodoHotkeyActionMock.mock.calls.map((call) => call[0])).toEqual(
      cases.map((testCase) => testCase.action),
    );
    expect(onTodoHotkeyActionMock.mock.calls.every((call) => call[1] === project)).toBe(true);
  });

  it("supports keyboard navigation and selection in the top project status menu", async () => {
    const project = makeProject({ statusText: "Lagging" });
    const secondProject = makeProject({
      lastTodoUid: "todo-2",
      pageTitle: "Project:: Track launch metrics",
      pageUid: "project-2",
      statusText: "On Track",
      todoListUid: "list-2",
    });
    const thirdProject = makeProject({
      lastTodoUid: "todo-3",
      pageTitle: "Project:: Fix rollout regressions",
      pageUid: "project-3",
      statusText: "Poor",
      todoListUid: "list-3",
    });
    const props = await renderStep([project, secondProject, thirdProject]);

    const [statusButton, dismissButton] = Array.from(
      root.querySelectorAll(".gtd-project-top-control"),
    ) as Array<HTMLButtonElement>;
    expect(statusButton).toBeDefined();
    expect(dismissButton).toBeDefined();

    act(() => {
      statusButton.focus();
      statusButton.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      );
    });
    await flush();
    await flush();

    let options = Array.from(
      root.querySelectorAll(".gtd-project-status-option"),
    ) as Array<HTMLButtonElement>;
    expect(options).toHaveLength(3);
    expect(options[0]?.dataset.highlighted).toBe("true");
    act(() => {
      options[0]?.focus();
    });
    expect(dom.window.document.activeElement).toBe(options[0]);

    act(() => {
      options[0]?.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          bubbles: true,
          key: "n",
          metaKey: true,
        }),
      );
    });
    await flush();
    await flush();

    options = Array.from(
      root.querySelectorAll(".gtd-project-status-option"),
    ) as Array<HTMLButtonElement>;
    expect(dom.window.document.activeElement).toBe(options[1]);
    expect(options[1]?.dataset.highlighted).toBe("true");

    act(() => {
      options[1]?.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          bubbles: true,
          ctrlKey: true,
          key: "p",
        }),
      );
    });
    await flush();
    await flush();

    options = Array.from(
      root.querySelectorAll(".gtd-project-status-option"),
    ) as Array<HTMLButtonElement>;
    expect(options[0]?.dataset.highlighted).toBe("true");
    act(() => {
      options[0]?.focus();
    });
    expect(dom.window.document.activeElement).toBe(options[0]);
    expect(options[0]?.dataset.highlighted).toBe("true");

    act(() => {
      options[0]?.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "Tab" }),
      );
    });
    await flush();
    await flush();

    expect(props.onStatusChange).toHaveBeenCalledWith(project, "Lagging");
    expect(dom.window.document.activeElement).toBe(dismissButton);

    act(() => {
      statusButton.focus();
      statusButton.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      );
    });
    await flush();
    await flush();

    options = Array.from(
      root.querySelectorAll(".gtd-project-status-option"),
    ) as Array<HTMLButtonElement>;
    expect(options[0]?.dataset.highlighted).toBe("true");
    act(() => {
      options[0]?.focus();
    });
    expect(dom.window.document.activeElement).toBe(options[0]);

    act(() => {
      options[0]?.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      );
    });
    await flush();
    await flush();

    expect(root.querySelector(".gtd-project-status-menu")).toBeNull();
    expect(dom.window.document.activeElement).toBe(statusButton);
  });

  it("routes top-project Cmd/Ctrl+Enter to focus the todo or create a missing one", async () => {
    const projectWithTodo = makeProject();
    const propsWithTodo = await renderStep([projectWithTodo]);

    await act(async () => {
      dom.window.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          bubbles: true,
          key: "Enter",
          metaKey: true,
        }),
      );
    });
    await flush();

    expect(dom.window.document.activeElement).toBe(
      root.querySelector("[data-testid='project-todo-block']"),
    );
    expect(propsWithTodo.onCreateProjectTodo).not.toHaveBeenCalled();

    const createProjectTodo = vi.fn(async () => undefined);
    const projectWithoutTodo = makeProject({
      lastTodoCreatedTime: null,
      lastTodoText: null,
      lastTodoUid: null,
      todoCount: 0,
    });
    await renderStep([projectWithoutTodo], {
      onCreateProjectTodo: createProjectTodo,
    });

    await act(async () => {
      dom.window.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          bubbles: true,
          ctrlKey: true,
          key: "Enter",
        }),
      );
    });
    await flush();

    expect(createProjectTodo).toHaveBeenCalledWith(projectWithoutTodo);
  });
});
