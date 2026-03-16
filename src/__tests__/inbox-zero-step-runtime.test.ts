import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WeeklyReviewRoamBlockHandle } from "../components/WeeklyReviewRoamBlock";
import { useInboxZeroStepRuntime } from "../inbox-zero/use-step-runtime";
import type { GtdSettings } from "../settings";
import type { createGtdStore } from "../store";
import type { TodoItem } from "../types";
import { TEST_SETTINGS } from "./fixtures";

type GtdStore = ReturnType<typeof createGtdStore>;

type RuntimeSnapshot = ReturnType<typeof useInboxZeroStepRuntime> & {
  cacheCalls: Array<string>;
  pendingDelegateValues: Array<string | null>;
  restoreCalls: Array<string | undefined>;
  showDelegateValues: Array<boolean>;
};

interface RuntimeHarnessProps {
  goBackRef: React.MutableRefObject<(() => void) | null>;
  items: Array<TodoItem>;
  onAdvance: () => void;
  onAtEndChange?: (atEnd: boolean) => void;
  onIndexChange?: (index: number) => void;
  onProgressChange?: (current: number, total: number) => void;
  onSnapshot: (snapshot: RuntimeSnapshot) => void;
  settings: GtdSettings;
  skipItemRef: React.MutableRefObject<(() => void) | null>;
  store: GtdStore;
}

const BASE_ITEM: TodoItem = {
  ageDays: 0,
  createdTime: 0,
  deferredDate: null,
  pageTitle: "Inbox",
  text: "{{[[TODO]]}} Review release packaging",
  uid: "todo-1",
};

function noop(): void {
  return undefined;
}

function createStore(): GtdStore {
  return {
    getSnapshot: vi.fn(() => ({ projects: [] })),
    refresh: vi.fn(),
    scheduleRefresh: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  } as unknown as GtdStore;
}

function RuntimeHarness(props: RuntimeHarnessProps) {
  const cacheCallsRef = React.useRef<Array<string>>([]);
  const restoreCallsRef = React.useRef<Array<string | undefined>>([]);
  const pendingDelegateValuesRef = React.useRef<Array<string | null>>([]);
  const showDelegateValuesRef = React.useRef<Array<boolean>>([]);
  const embedBlockRef = React.useRef<WeeklyReviewRoamBlockHandle | null>({
    cancelPendingFocus: noop,
    focusEditor: () => false,
    getContainer: () => null,
  });
  const embedContainerRef = React.useRef<HTMLDivElement | null>(null);
  const leftPanelRef = React.useRef<HTMLDivElement | null>(null);
  const triageRootRef = React.useRef<HTMLDivElement | null>(null);
  const cacheFormStateRef = React.useRef<(uid: string) => void>((uid) => {
    cacheCallsRef.current.push(uid);
  });
  const restoreFormStateRef = React.useRef<(uid?: string) => void>((uid) => {
    restoreCallsRef.current.push(uid);
  });
  const setPendingDelegateUidRef = React.useRef<(uid: string | null) => void>((uid) => {
    pendingDelegateValuesRef.current.push(uid);
  });
  const setShowDelegatePromptRef = React.useRef<(value: boolean) => void>((value) => {
    showDelegateValuesRef.current.push(value);
  });

  const runtime = useInboxZeroStepRuntime({
    cacheFormStateRef,
    embedBlockRef,
    embedContainerRef,
    goBackRef: props.goBackRef,
    items: props.items,
    leftPanelRef,
    onAdvance: props.onAdvance,
    onAtEndChange: props.onAtEndChange,
    onIndexChange: props.onIndexChange,
    onProgressChange: props.onProgressChange,
    restoreFormStateRef,
    setPendingDelegateUidRef,
    setShowDelegatePromptRef,
    settings: props.settings,
    skipItemRef: props.skipItemRef,
    store: props.store,
    triageRootRef,
  });

  React.useLayoutEffect(() => {
    triageRootRef.current = document.querySelector<HTMLDivElement>(
      "[data-testid='runtime-triage-root']",
    );
    leftPanelRef.current = document.querySelector<HTMLDivElement>(
      "[data-testid='runtime-left-panel']",
    );
    embedContainerRef.current = document.querySelector<HTMLDivElement>(
      "[data-testid='runtime-embed-container']",
    );
    props.onSnapshot({
      ...runtime,
      cacheCalls: [...cacheCallsRef.current],
      pendingDelegateValues: [...pendingDelegateValuesRef.current],
      restoreCalls: [...restoreCallsRef.current],
      showDelegateValues: [...showDelegateValuesRef.current],
    });
  });

  return React.createElement(
    "div",
    { className: "roam-gtd-review-dialog" },
    React.createElement(
      "div",
      { "data-testid": "runtime-triage-root", tabIndex: -1 },
      React.createElement("div", { "data-testid": "runtime-left-panel" }),
      React.createElement("div", { "data-testid": "runtime-embed-container" }),
    ),
  );
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("useInboxZeroStepRuntime", () => {
  let blocks: Map<string, string>;
  let dom: JSDOM;
  let root: HTMLDivElement;
  let goBackRef: React.MutableRefObject<(() => void) | null>;
  let latestSnapshot: RuntimeSnapshot | null;
  let onAdvance: ReturnType<typeof vi.fn>;
  let onAtEndChange: ReturnType<typeof vi.fn>;
  let onIndexChange: ReturnType<typeof vi.fn>;
  let onProgressChange: ReturnType<typeof vi.fn>;
  let skipItemRef: React.MutableRefObject<(() => void) | null>;
  let store: GtdStore;

  beforeEach(() => {
    vi.clearAllMocks();
    latestSnapshot = null;
    blocks = new Map([[BASE_ITEM.uid, BASE_ITEM.text]]);
    dom = new JSDOM("<div id='root'></div>", {
      url: "https://example.com",
    });
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    goBackRef = { current: null };
    onAdvance = vi.fn();
    onAtEndChange = vi.fn();
    onIndexChange = vi.fn();
    onProgressChange = vi.fn();
    skipItemRef = { current: null };
    store = createStore();

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

  async function renderHarness(items: Array<TodoItem>): Promise<void> {
    await act(async () => {
      ReactDOM.render(
        React.createElement(RuntimeHarness, {
          goBackRef,
          items,
          onAdvance,
          onAtEndChange,
          onIndexChange,
          onProgressChange,
          onSnapshot: (snapshot: RuntimeSnapshot) => {
            latestSnapshot = snapshot;
          },
          settings: TEST_SETTINGS,
          skipItemRef,
          store,
        }),
        root,
      );
    });

    await flush();
    await flush();
  }

  it("advances, reports parent progress, and goes back through processed items", async () => {
    const nextItem: TodoItem = {
      ...BASE_ITEM,
      text: "{{[[TODO]]}} Confirm release notes",
      uid: "todo-2",
    };
    blocks.set(nextItem.uid, nextItem.text);

    await renderHarness([BASE_ITEM, nextItem]);

    expect(onAtEndChange).toHaveBeenLastCalledWith(false);
    expect(onIndexChange).toHaveBeenLastCalledWith(0);
    expect(onProgressChange).toHaveBeenLastCalledWith(1, 2);

    await act(async () => {
      latestSnapshot?.advanceWithExpectedRemoval(BASE_ITEM.uid, BASE_ITEM.text);
    });
    await flush();

    expect(latestSnapshot?.currentItemUid).toBe(nextItem.uid);
    expect(latestSnapshot?.displayPosition).toBe(1);
    expect(onAtEndChange).toHaveBeenLastCalledWith(true);
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
    expect(onProgressChange).toHaveBeenLastCalledWith(2, 2);
    expect(latestSnapshot?.cacheCalls).toContain(BASE_ITEM.uid);
    expect(latestSnapshot?.restoreCalls.at(-1)).toBeUndefined();
    expect(latestSnapshot?.pendingDelegateValues.at(-1)).toBeNull();
    expect(latestSnapshot?.showDelegateValues.at(-1)).toBe(false);

    await act(async () => {
      goBackRef.current?.();
    });
    await flush();

    expect(latestSnapshot?.currentItemUid).toBe(BASE_ITEM.uid);
    expect(latestSnapshot?.currentItemText).toBe(BASE_ITEM.text);
    expect(onAtEndChange).toHaveBeenLastCalledWith(true);
    expect(onIndexChange).toHaveBeenLastCalledWith(0);
    expect(onProgressChange).toHaveBeenLastCalledWith(1, 2);
    expect(latestSnapshot?.restoreCalls.at(-1)).toBe(BASE_ITEM.uid);
  });

  it("recovers when the current item disappears and schedules an inbox refresh", async () => {
    const nextItem: TodoItem = {
      ...BASE_ITEM,
      text: "{{[[TODO]]}} Review launch checklist",
      uid: "todo-2",
    };
    blocks.set(nextItem.uid, nextItem.text);

    await renderHarness([BASE_ITEM, nextItem]);

    await act(async () => {
      latestSnapshot?.handleMissingCurrentItem(BASE_ITEM.uid);
    });
    await flush();

    expect(latestSnapshot?.currentItemUid).toBe(nextItem.uid);
    expect(store.scheduleRefresh).toHaveBeenCalledWith(TEST_SETTINGS, 300, {
      scope: "inboxOnly",
    });
    expect(latestSnapshot?.restoreCalls.at(-1)).toBeUndefined();
    expect(latestSnapshot?.pendingDelegateValues.at(-1)).toBeNull();
    expect(latestSnapshot?.showDelegateValues.at(-1)).toBe(false);
  });

  it("reconciles the current uid against refreshed items when the live current item disappears", async () => {
    const secondItem: TodoItem = {
      ...BASE_ITEM,
      text: "{{[[TODO]]}} Review launch checklist",
      uid: "todo-2",
    };
    const thirdItem: TodoItem = {
      ...BASE_ITEM,
      text: "{{[[TODO]]}} Confirm cutover plan",
      uid: "todo-3",
    };
    blocks.set(secondItem.uid, secondItem.text);
    blocks.set(thirdItem.uid, thirdItem.text);

    await renderHarness([BASE_ITEM, secondItem, thirdItem]);

    await act(async () => {
      latestSnapshot?.advanceWithExpectedRemoval(BASE_ITEM.uid, BASE_ITEM.text);
    });
    await flush();

    expect(latestSnapshot?.currentItemUid).toBe(secondItem.uid);

    await renderHarness([BASE_ITEM, thirdItem]);

    expect(latestSnapshot?.currentItemUid).toBe(thirdItem.uid);
  });

  it("exits back-view and returns to the live stream when a focused processed item disappears", async () => {
    const nextItem: TodoItem = {
      ...BASE_ITEM,
      text: "{{[[TODO]]}} Confirm release notes",
      uid: "todo-2",
    };
    blocks.set(nextItem.uid, nextItem.text);

    await renderHarness([BASE_ITEM, nextItem]);

    await act(async () => {
      latestSnapshot?.advanceWithExpectedRemoval(BASE_ITEM.uid, BASE_ITEM.text);
    });
    await flush();

    await act(async () => {
      goBackRef.current?.();
    });
    await flush();

    expect(latestSnapshot?.currentItemUid).toBe(BASE_ITEM.uid);

    blocks.delete(BASE_ITEM.uid);
    await act(async () => {
      window.dispatchEvent(new dom.window.Event("focus"));
    });
    await flush();

    expect(latestSnapshot?.currentItemUid).toBe(nextItem.uid);
    expect(latestSnapshot?.restoreCalls.at(-1)).toBeUndefined();
    expect(latestSnapshot?.pendingDelegateValues.at(-1)).toBeNull();
    expect(latestSnapshot?.showDelegateValues.at(-1)).toBe(false);
  });

  it("syncs processed snapshots with returning live items before they disappear again", async () => {
    const nextItem: TodoItem = {
      ...BASE_ITEM,
      text: "{{[[TODO]]}} Confirm release notes",
      uid: "todo-2",
    };
    const refreshedBaseItem: TodoItem = {
      ...BASE_ITEM,
      createdTime: 1,
      text: "{{[[TODO]]}} Review release packaging with updated details",
    };
    blocks.set(nextItem.uid, nextItem.text);
    blocks.set(BASE_ITEM.uid, refreshedBaseItem.text);

    await renderHarness([BASE_ITEM, nextItem]);

    await act(async () => {
      latestSnapshot?.advanceWithExpectedRemoval(BASE_ITEM.uid, BASE_ITEM.text);
    });
    await flush();

    await renderHarness([refreshedBaseItem, nextItem]);
    await renderHarness([nextItem]);

    await act(async () => {
      goBackRef.current?.();
    });
    await flush();

    expect(latestSnapshot?.currentItemUid).toBe(BASE_ITEM.uid);
    expect(latestSnapshot?.currentItemText).toBe(refreshedBaseItem.text);
  });
});
