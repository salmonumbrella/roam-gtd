import { JSDOM } from "jsdom";
import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAgendaTodo: vi.fn(async () => undefined),
  pageHasTag: vi.fn(() => false),
  reactivateProjectStatusIfInactive: vi.fn(async () => undefined),
  runTriageProcess: vi.fn(async () => ({ shouldHide: true })),
  teleportBlockToProject: vi.fn(async () => undefined),
  validateWebhookUrl: vi.fn(() => ""),
}));

vi.mock("../people", () => ({
  createAgendaTodo: mocks.createAgendaTodo,
  pageHasTag: mocks.pageHasTag,
}));

vi.mock("../teleport", () => ({
  createProjectFromTemplateAndTeleportTodo: vi.fn(async () => undefined),
  reactivateProjectStatusIfInactive: mocks.reactivateProjectStatusIfInactive,
  teleportBlockToProject: mocks.teleportBlockToProject,
}));

vi.mock("../triage/process-engine", () => ({
  runTriageProcess: mocks.runTriageProcess,
}));

vi.mock("../triage/step-logic", () => ({
  shouldReactivateProjectOnMove: vi.fn(() => false),
  validateWebhookUrl: mocks.validateWebhookUrl,
}));

import {
  CONTEXT_AUTOCOMPLETE_ID,
  DELEGATE_AUTOCOMPLETE_ID,
  PROJECT_AUTOCOMPLETE_ID,
} from "../triage/form-helpers";
import {
  createWorkflowAgentDelegationNotifier,
  readWorkflowProcessPopoverFormStateFromDom,
  useWorkflowProcessPopoverSubmission,
} from "../workflow-process-popover/submission";
import { TEST_SETTINGS } from "./fixtures";

describe("workflow process popover submission", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    dom = new JSDOM("<div id='root'></div>");
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Node", dom.window.Node);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true })),
    );
    Object.assign(globalThis.window, {
      roamAlphaAPI: {
        data: {
          pull: vi.fn(() => ({ ":block/string": "{{[[TODO]]}} Review block" })),
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

  it("reads the current form state from the DOM and resolves the selected project", () => {
    document.body.innerHTML = `
      <input id="${CONTEXT_AUTOCOMPLETE_ID}" value="[[@Home]]" />
      <input id="${DELEGATE_AUTOCOMPLETE_ID}" value="Alice" />
      <input id="${PROJECT_AUTOCOMPLETE_ID}" value="Project/Alpha" />
    `;

    const formState = readWorkflowProcessPopoverFormStateFromDom({
      projects: [{ title: "Project/Alpha", uid: "project-alpha" }],
    });

    expect(formState).toEqual({
      contextQuery: "[[@Home]]",
      delegateQuery: "Alice",
      projectQuery: "Project/Alpha",
      selectedProject: { title: "Project/Alpha", uid: "project-alpha" },
    });
  });

  it("only notifies delegated agents when the target page is tagged as an agent", async () => {
    mocks.pageHasTag.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const notifier = createWorkflowAgentDelegationNotifier({
      settings: {
        ...TEST_SETTINGS,
        agentDelegationWebhookUrl: "https://example.com/hook",
      },
    });

    await notifier({
      agentTitle: "Alice",
      agentUid: "alice",
      taskUid: "task-1",
    });
    await notifier({
      agentTitle: "Bot",
      agentUid: "bot-1",
      taskUid: "task-2",
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("does not re-enter processing while the shared engine promise is pending", async () => {
    let resolveProcess: (() => void) | null = null;
    mocks.runTriageProcess.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveProcess = () => resolve({ shouldHide: false });
      }),
    );

    let current: ReturnType<typeof useWorkflowProcessPopoverSubmission> | undefined;
    const setCurrent = (value: ReturnType<typeof useWorkflowProcessPopoverSubmission>) => {
      current = value;
    };

    function Harness() {
      const value = useWorkflowProcessPopoverSubmission({
        currentTag: "watch",
        isOpen: true,
        onProcessComplete: vi.fn(),
        people: [],
        persistedDueDate: "",
        readDomFormValues: () => ({
          contextQuery: "",
          delegateQuery: "",
          projectQuery: "",
          selectedProject: null,
        }),
        scheduleIntent: null,
        settings: TEST_SETTINGS,
        syncPersistedDueDateValue: vi.fn(),
        t: (key: string) => key,
        targetText: "{{[[TODO]]}} Review block",
        targetUid: "todo-uid",
        unsetDue: false,
      });
      useEffect(() => {
        setCurrent(value);
      }, [value]);
      return null;
    }

    act(() => {
      ReactDOM.render(React.createElement(Harness), root);
    });

    await act(async () => {
      void current?.handleProcess();
      void current?.handleProcess();
      await Promise.resolve();
    });

    expect(mocks.runTriageProcess).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveProcess?.();
      await Promise.resolve();
    });
  });
});
