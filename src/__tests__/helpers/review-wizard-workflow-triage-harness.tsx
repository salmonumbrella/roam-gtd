import { JSDOM } from "jsdom";
import React, { useCallback, useLayoutEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { vi } from "vitest";

import type { UnifiedReviewRowTriageRequest } from "../../components/UnifiedReviewRow";
import {
  buildDelegatedPersonRefsCacheKey,
  cacheDelegatedPersonRefs,
  type DelegatedPersonRefsSnapshot,
} from "../../review/wizard-runtime";
import type { WizardStepKey } from "../../review/wizard-support";
import {
  useReviewWizardWorkflowTriage,
  type ActiveWorkflowTriageState,
} from "../../review/wizard-workflow-triage";
import type { GtdSettings } from "../../settings";
import type { TodoItem } from "../../types";
import { TEST_SETTINGS } from "../fixtures";

type WorkflowTriageHookValue = ReturnType<typeof useReviewWizardWorkflowTriage>;

interface CreateWorkflowTriageHarnessArgs {
  delegatedItems?: Array<TodoItem>;
  isOpen?: boolean;
  settings?: GtdSettings;
  stepKey?: WizardStepKey;
  visibleItems?: Array<TodoItem>;
}

interface AnchorRectInput {
  bottom?: number;
  right?: number;
}

interface ConnectedAnchor {
  connect(): void;
  disconnect(): void;
  element: HTMLElement;
  setRect(rect: AnchorRectInput): void;
}

const DEFAULT_DIALOG_BODY_RECT = {
  bottom: 540,
  clientWidth: 420,
  height: 520,
  left: 40,
  right: 460,
  top: 20,
  width: 420,
};

const EMPTY_DELEGATED_PERSON_REFS_SNAPSHOT: DelegatedPersonRefsSnapshot = {
  childPersonRefs: new Map(),
  people: [],
};

function createDomRect(args: {
  bottom: number;
  left: number;
  right: number;
  top: number;
  width: number;
}): DOMRect {
  const { bottom, left, right, top, width } = args;
  const height = bottom - top;
  return {
    bottom,
    height,
    left,
    right,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top,
  } as DOMRect;
}

export function createWorkflowTriageTodo(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    ageDays: 0,
    createdTime: 0,
    deferredDate: null,
    pageTitle: "Inbox",
    text: "Follow up",
    uid: "todo-1",
    ...overrides,
  };
}

export function createWorkflowTriageRequest(args: {
  anchorElement: HTMLElement;
  currentTag?: string;
  item: TodoItem;
}): UnifiedReviewRowTriageRequest {
  return {
    anchorElement: args.anchorElement,
    currentTag: args.currentTag ?? TEST_SETTINGS.tagWaitingFor,
    item: args.item,
  };
}

export function resetDelegatedPersonRefsCache(now = Date.now()): void {
  cacheDelegatedPersonRefs("__workflow-triage-reset__", EMPTY_DELEGATED_PERSON_REFS_SNAPSHOT, now);
}

export function seedDelegatedPersonRefsCache(args: {
  delegateTargetTags: Array<string>;
  loadedAt?: number;
  snapshot: DelegatedPersonRefsSnapshot;
  uids: Array<string>;
}): string {
  const key = buildDelegatedPersonRefsCacheKey(args.uids, args.delegateTargetTags);
  cacheDelegatedPersonRefs(key, args.snapshot, args.loadedAt);
  return key;
}

export function createWorkflowTriageHarness({
  delegatedItems = [],
  isOpen = true,
  settings = TEST_SETTINGS,
  stepKey = "upcoming",
  visibleItems = delegatedItems,
}: CreateWorkflowTriageHarnessArgs = {}) {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://example.com" });
  const root = dom.window.document.getElementById("root") as HTMLDivElement;
  const anchorHost = dom.window.document.createElement("div");
  dom.window.document.body.append(anchorHost);

  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("Node", dom.window.Node);
  dom.window.setTimeout = globalThis.setTimeout.bind(globalThis) as typeof dom.window.setTimeout;
  dom.window.clearTimeout = globalThis.clearTimeout.bind(
    globalThis,
  ) as typeof dom.window.clearTimeout;

  let currentDelegatedItems = delegatedItems;
  let currentIsOpen = isOpen;
  let currentSettings = settings;
  let currentStepKey = stepKey;
  let currentVisibleItems = visibleItems;
  const dialogBodyId = "workflow-triage-dialog-body";
  let latestValue: WorkflowTriageHookValue | null = null;

  function Probe() {
    const dialogBodyRef = useRef<HTMLDivElement | null>(null);
    const syncDialogBodyRef = useCallback(() => {
      const node = dom.window.document.getElementById(dialogBodyId) as HTMLDivElement | null;
      dialogBodyRef.current = node;
      if (!node) {
        return;
      }
      Object.defineProperty(node, "clientWidth", {
        configurable: true,
        get: () => DEFAULT_DIALOG_BODY_RECT.clientWidth,
      });
      node.getBoundingClientRect = () =>
        createDomRect({
          bottom: DEFAULT_DIALOG_BODY_RECT.bottom,
          left: DEFAULT_DIALOG_BODY_RECT.left,
          right: DEFAULT_DIALOG_BODY_RECT.right,
          top: DEFAULT_DIALOG_BODY_RECT.top,
          width: DEFAULT_DIALOG_BODY_RECT.width,
        });
    }, []);

    useLayoutEffect(() => {
      syncDialogBodyRef();
    }, [syncDialogBodyRef]);

    const value = useReviewWizardWorkflowTriage({
      delegatedItems: currentDelegatedItems,
      dialogBodyRef,
      isOpen: currentIsOpen,
      settings: currentSettings,
      stepKey: currentStepKey,
      visibleItems: currentVisibleItems,
    });

    useLayoutEffect(() => {
      latestValue = value;
    }, [value]);

    return React.createElement("div", null, React.createElement("div", { id: dialogBodyId }));
  }

  async function render(): Promise<void> {
    await act(async () => {
      ReactDOM.render(React.createElement(Probe), root);
      await Promise.resolve();
    });
  }

  async function rerender(
    args: Partial<{
      delegatedItems: Array<TodoItem>;
      isOpen: boolean;
      settings: GtdSettings;
      stepKey: WizardStepKey;
      visibleItems: Array<TodoItem>;
    }>,
  ): Promise<void> {
    if ("delegatedItems" in args) {
      currentDelegatedItems = args.delegatedItems ?? [];
    }
    if ("isOpen" in args) {
      currentIsOpen = args.isOpen ?? false;
    }
    if ("settings" in args) {
      currentSettings = args.settings ?? TEST_SETTINGS;
    }
    if ("stepKey" in args) {
      currentStepKey = args.stepKey ?? "upcoming";
    }
    if ("visibleItems" in args) {
      currentVisibleItems = args.visibleItems ?? [];
    }
    await render();
  }

  function getValue(): WorkflowTriageHookValue {
    if (latestValue == null) {
      throw new Error("Workflow triage harness has not been rendered");
    }
    return latestValue;
  }

  async function invoke<T>(
    callback: (value: WorkflowTriageHookValue) => T | Promise<T>,
  ): Promise<Awaited<T>> {
    let result: Awaited<T>;
    await act(async () => {
      result = await callback(getValue());
    });
    return result!;
  }

  function createConnectedAnchor(
    args: {
      bottom?: number;
      right?: number;
    } = {},
  ): ConnectedAnchor {
    let rect = {
      bottom: args.bottom ?? 160,
      right: args.right ?? 360,
    };
    const element = dom.window.document.createElement("button");
    element.getBoundingClientRect = () =>
      createDomRect({
        bottom: rect.bottom,
        left: rect.right - 24,
        right: rect.right,
        top: rect.bottom - 24,
        width: 24,
      });
    anchorHost.append(element);

    return {
      connect() {
        if (!element.isConnected) {
          anchorHost.append(element);
        }
      },
      disconnect() {
        element.remove();
      },
      element,
      setRect(nextRect) {
        rect = {
          ...rect,
          ...nextRect,
        };
      },
    };
  }

  return {
    cleanup() {
      act(() => {
        ReactDOM.unmountComponentAtNode(root);
      });
      root.remove();
      anchorHost.remove();
      vi.unstubAllGlobals();
      dom.window.close();
    },
    async clearWorkflowTriageForUid(uid: string) {
      await invoke((value) => value.clearWorkflowTriageForUid(uid));
    },
    async closeWorkflowTriage() {
      await invoke((value) => value.closeWorkflowTriage());
    },
    createConnectedAnchor,
    createRequest(args: { anchorElement: HTMLElement; currentTag?: string; item: TodoItem }) {
      return createWorkflowTriageRequest(args);
    },
    async dispatchWindowEvent(type: "resize" | "scroll") {
      await act(async () => {
        dom.window.dispatchEvent(new dom.window.Event(type));
        await Promise.resolve();
      });
    },
    getActiveWorkflowTriage(): ActiveWorkflowTriageState | null {
      return getValue().activeWorkflowTriage;
    },
    getDelegatedChildPersonRefs() {
      return getValue().delegatedChildPersonRefs;
    },
    getDelegatedPeople() {
      return getValue().delegatedPeople;
    },
    getTriagePeople() {
      return getValue().triagePeople;
    },
    getTriageProjects() {
      return getValue().triageProjects;
    },
    getValue,
    getWorkflowTriagePosition() {
      return getValue().workflowTriagePosition;
    },
    async openWorkflowTriage(request: UnifiedReviewRowTriageRequest) {
      await invoke((value) => value.openWorkflowTriage(request));
    },
    render,
    rerender,
  };
}
