import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { vi } from "vitest";

import { useReviewWizardProjectDetail } from "../../review/wizard-project-detail";
import type { GtdSettings } from "../../settings";
import type { ProjectSummary } from "../../types";
import { TEST_SETTINGS } from "../fixtures";

type ProjectDetailHookValue = ReturnType<typeof useReviewWizardProjectDetail>;

export function createProjectDetailProject(
  overrides: Partial<ProjectSummary> = {},
): ProjectSummary {
  return {
    doneCount: 0,
    lastDoneTime: null,
    lastTodoCreatedTime: null,
    lastTodoText: null,
    lastTodoUid: null,
    pageTitle: "Project Alpha",
    pageUid: "project-alpha",
    statusBlockUid: null,
    statusText: null,
    todoCount: 0,
    todoListUid: null,
    totalCount: 0,
    ...overrides,
  };
}

interface CreateProjectDetailHarnessArgs {
  bodyProjects?: Array<ProjectSummary>;
  generatedUids?: Array<string>;
  settings?: GtdSettings;
  stateProjects?: Array<ProjectSummary>;
}

export function createProjectDetailHarness({
  bodyProjects = [],
  generatedUids = [],
  settings = TEST_SETTINGS,
  stateProjects = bodyProjects,
}: CreateProjectDetailHarnessArgs = {}) {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://example.com" });
  const root = dom.window.document.getElementById("root") as HTMLDivElement;
  let currentBodyProjects = bodyProjects;
  let currentStateProjects = stateProjects;
  let nextUidIndex = 0;
  let latestValue: ProjectDetailHookValue | null = null;

  const blockStrings = new Map<string, string>();
  const createBlock = vi.fn(
    async ({
      block,
    }: {
      block: { string: string; uid: string };
      location: { order: number | "last"; "parent-uid": string };
    }) => {
      blockStrings.set(block.uid, block.string);
    },
  );
  const updateBlock = vi.fn(async ({ block }: { block: { string: string; uid: string } }) => {
    blockStrings.set(block.uid, block.string);
  });
  const pull = vi.fn((pattern: string, lookup: [string, string]) => {
    const uid = lookup[1];
    if (!blockStrings.has(uid)) {
      return null;
    }
    const result: Record<string, string> = {};
    if (pattern.includes(":block/uid")) {
      result[":block/uid"] = uid;
    }
    if (pattern.includes(":block/string")) {
      result[":block/string"] = blockStrings.get(uid) ?? "";
    }
    return result;
  });
  const generateUID = vi.fn(() => {
    const uid = generatedUids[nextUidIndex] ?? `generated-${nextUidIndex + 1}`;
    nextUidIndex += 1;
    return uid;
  });
  const store = {
    refresh: vi.fn(async () => undefined),
    scheduleRefresh: vi.fn(),
  };

  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("localStorage", dom.window.localStorage);
  vi.stubGlobal("Node", dom.window.Node);
  Object.assign(globalThis.window, {
    roamAlphaAPI: {
      createBlock,
      data: {
        pull,
      },
      updateBlock,
      util: {
        generateUID,
      },
    },
  });

  function Probe() {
    const value = useReviewWizardProjectDetail({
      bodyProjects: currentBodyProjects,
      settings,
      stateProjects: currentStateProjects,
      store: store as never,
    });
    React.useEffect(() => {
      latestValue = value;
    }, [value]);
    return null;
  }

  async function render(): Promise<void> {
    await act(async () => {
      ReactDOM.render(React.createElement(Probe), root);
    });
  }

  async function rerender(args: {
    bodyProjects?: Array<ProjectSummary>;
    stateProjects?: Array<ProjectSummary>;
  }): Promise<void> {
    if ("bodyProjects" in args) {
      currentBodyProjects = args.bodyProjects ?? [];
    }
    if ("stateProjects" in args) {
      currentStateProjects = args.stateProjects ?? [];
    }
    await render();
  }

  function getValue(): ProjectDetailHookValue {
    if (latestValue == null) {
      throw new Error("Project detail harness has not been rendered");
    }
    return latestValue;
  }

  async function invoke<T>(
    callback: (value: ProjectDetailHookValue) => T | Promise<T>,
  ): Promise<Awaited<T>> {
    let result: Awaited<T>;
    await act(async () => {
      result = await callback(getValue());
    });
    return result!;
  }

  return {
    blockStrings,
    cleanup() {
      ReactDOM.unmountComponentAtNode(root);
      vi.unstubAllGlobals();
      dom.window.close();
    },
    createBlock,
    deleteBlock(uid: string) {
      blockStrings.delete(uid);
    },
    dom,
    generateUID,
    getLocalStorageEntries() {
      const entries: Array<{ key: string; value: string }> = [];
      for (let index = 0; index < dom.window.localStorage.length; index += 1) {
        const key = dom.window.localStorage.key(index);
        if (!key) {
          continue;
        }
        entries.push({
          key,
          value: dom.window.localStorage.getItem(key) ?? "",
        });
      }
      return entries;
    },
    getValue,
    async handleCloseProjectDetail() {
      await invoke((value) => value.handleCloseProjectDetail());
    },
    async handleCreateProjectTodo(project: ProjectSummary) {
      await invoke((value) => value.handleCreateProjectTodo(project));
    },
    async handleDismissProject(project: ProjectSummary) {
      await invoke((value) => value.handleDismissProject(project));
    },
    async handleOpenProjectDetail(project: ProjectSummary) {
      await invoke((value) => value.handleOpenProjectDetail(project));
    },
    async handleProjectFocusRequestHandled() {
      await invoke((value) => value.handleProjectFocusRequestHandled());
    },
    async handleProjectStatusChange(project: ProjectSummary, nextStatus: string) {
      return invoke((value) => value.handleProjectStatusChange(project, nextStatus));
    },
    async handleProjectTodoBlur(todoUid: string) {
      await invoke((value) => value.handleProjectTodoBlur(todoUid));
    },
    async handleProjectTodoHotkeyAction(
      action: "delegate" | "reference" | "someday" | "up" | "watch",
      project: ProjectSummary,
    ) {
      await invoke((value) => value.handleProjectTodoHotkeyAction(action, project));
    },
    pull,
    render,
    replaceOnlyStoredDismissedProjects(uids: Array<string>) {
      const key = dom.window.localStorage.key(0);
      if (!key) {
        throw new Error("No dismissed-project storage entry to replace");
      }
      dom.window.localStorage.setItem(key, JSON.stringify(uids));
    },
    rerender,
    async resetProjectDetailState() {
      await invoke((value) => value.resetProjectDetailState());
    },
    root,
    setBlockString(uid: string, string: string) {
      blockStrings.set(uid, string);
    },
    store,
    updateBlock,
  };
}
