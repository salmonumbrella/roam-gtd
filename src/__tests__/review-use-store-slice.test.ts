import { JSDOM } from "jsdom";
import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_SETTINGS } from "./fixtures";

const scheduleMocks = vi.hoisted(() => ({
  applyScheduleIntentToBlock: vi.fn(async () => undefined),
  checkScheduleConflict: vi.fn(async () => null),
  clearDueDateChild: vi.fn(async () => []),
  getCurrentDueDateValue: vi.fn(() => ""),
}));

vi.mock("../review/schedule", () => ({
  applyScheduleIntentToBlock: scheduleMocks.applyScheduleIntentToBlock,
  checkScheduleConflict: scheduleMocks.checkScheduleConflict,
  clearDueDateChild: scheduleMocks.clearDueDateChild,
  getCurrentDueDateValue: scheduleMocks.getCurrentDueDateValue,
}));

type TestState = {
  inbox: Array<{ uid: string }>;
  loading: boolean;
  nextActions: Array<{ uid: string }>;
};

interface TestStore {
  getSnapshot: () => TestState;
  scheduleRefresh: ReturnType<typeof vi.fn>;
  subscribe: (listener: (state: TestState) => void) => () => void;
}

function createStore(initialState: TestState): {
  emit: (next: TestState) => void;
  store: TestStore;
} {
  let currentState = initialState;
  const listeners = new Set<(state: TestState) => void>();
  return {
    emit(next: TestState) {
      currentState = next;
      for (const listener of listeners) {
        listener(next);
      }
    },
    store: {
      getSnapshot: () => currentState,
      scheduleRefresh: vi.fn(),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
  };
}

describe("useStoreSlice", () => {
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
    dom.window.close();
  });

  it("does not re-render when an object slice is equal and unrelated store fields change", async () => {
    const { useStoreSlice } = await import("../review/use-store-slice");
    const stableInbox = [{ uid: "inbox-1" }];
    const harness = createStore({
      inbox: stableInbox,
      loading: false,
      nextActions: [],
    });
    const onRender = vi.fn();

    function Harness() {
      const slice = useStoreSlice(
        harness.store as never,
        (state: TestState) => ({ inbox: state.inbox, loading: state.loading }),
        (left, right) => left.inbox === right.inbox && left.loading === right.loading,
      );
      useEffect(() => {
        onRender();
      }, [slice]);
      return React.createElement("div", null, `${slice.inbox.length}:${slice.loading ? "y" : "n"}`);
    }

    await act(async () => {
      ReactDOM.render(React.createElement(Harness), root);
    });

    await act(async () => {
      harness.emit({
        inbox: stableInbox,
        loading: false,
        nextActions: [{ uid: "next-1" }],
      });
    });

    expect(onRender).toHaveBeenCalledTimes(1);
    expect(root.textContent).toBe("1:n");
  });

  it("re-renders when the selected slice actually changes", async () => {
    const { useStoreSlice } = await import("../review/use-store-slice");
    const harness = createStore({
      inbox: [{ uid: "inbox-1" }],
      loading: false,
      nextActions: [],
    });
    const renderLog: Array<string> = [];

    function Harness() {
      const slice = useStoreSlice(harness.store as never, (state: TestState) => state.inbox);
      useEffect(() => {
        renderLog.push(slice.map((item) => item.uid).join(","));
      }, [slice]);
      return React.createElement("div", null, slice.map((item) => item.uid).join(","));
    }

    await act(async () => {
      ReactDOM.render(React.createElement(Harness), root);
    });

    await act(async () => {
      harness.emit({
        inbox: [{ uid: "inbox-2" }],
        loading: false,
        nextActions: [],
      });
    });

    expect(renderLog).toEqual(["inbox-1", "inbox-2"]);
    expect(root.textContent).toBe("inbox-2");
  });
});

describe("useScheduleController", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
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
    dom.window.close();
  });

  async function renderScheduleHarness() {
    const { useScheduleController } = await import("../review/use-schedule-controller");
    let current:
      | ReturnType<(typeof import("../review/use-schedule-controller"))["useScheduleController"]>
      | undefined;
    let second:
      | ReturnType<(typeof import("../review/use-schedule-controller"))["useScheduleController"]>
      | undefined;
    const store = createStore({ inbox: [], loading: false, nextActions: [] }).store;
    const setCurrent = (
      value: ReturnType<
        (typeof import("../review/use-schedule-controller"))["useScheduleController"]
      >,
    ) => {
      current = value;
    };
    const setSecond = (
      value: ReturnType<
        (typeof import("../review/use-schedule-controller"))["useScheduleController"]
      >,
    ) => {
      second = value;
    };

    function Harness() {
      if (!useScheduleController) {
        throw new Error("Missing useScheduleController binding");
      }

      const firstValue = useScheduleController(store as never, TEST_SETTINGS);
      const secondValue = useScheduleController(store as never, TEST_SETTINGS);
      useEffect(() => {
        setCurrent(firstValue);
        setSecond(secondValue);
      }, [firstValue, secondValue]);
      return null;
    }

    act(() => {
      ReactDOM.render(React.createElement(Harness), root);
    });

    return {
      get current() {
        if (!current) {
          throw new Error("Missing first hook state");
        }
        return current;
      },
      get second() {
        if (!second) {
          throw new Error("Missing second hook state");
        }
        return second;
      },
      store,
    };
  }

  it("keeps scheduling state isolated per hook instance", async () => {
    const harness = await renderScheduleHarness();

    await act(async () => {
      harness.current.setSchedulingUid("uid-1");
    });

    expect(harness.current.schedulingUid).toBe("uid-1");
    expect(harness.second.schedulingUid).toBeNull();
  });

  it("confirms and unsets schedule state while refreshing the store", async () => {
    scheduleMocks.getCurrentDueDateValue.mockReturnValueOnce("February 25th, 2026");
    const harness = await renderScheduleHarness();

    await act(async () => {
      harness.current.setSchedulingUid("todo-1");
    });

    expect(harness.current.initialValue).toBe("February 25th, 2026");
    expect(harness.current.canUnset).toBe(true);

    await act(async () => {
      await harness.current.handleScheduleConfirm({
        date: new Date(2026, 1, 25, 9, 30),
        googleCalendarAccount: "Work Calendar",
        roamDate: "February 25th, 2026",
        time: "09:30",
      });
    });

    expect(scheduleMocks.checkScheduleConflict).toHaveBeenCalledTimes(1);
    expect(scheduleMocks.applyScheduleIntentToBlock).toHaveBeenCalledWith(
      "todo-1",
      expect.objectContaining({ roamDate: "February 25th, 2026" }),
      undefined,
    );
    expect(harness.store.scheduleRefresh).toHaveBeenCalledWith(TEST_SETTINGS, 800);
    expect(harness.current.schedulingUid).toBeNull();

    await act(async () => {
      harness.current.setSchedulingUid("todo-1");
      await harness.current.handleScheduleUnset();
    });

    expect(scheduleMocks.clearDueDateChild).toHaveBeenCalledWith("todo-1");
    expect(harness.store.scheduleRefresh).toHaveBeenCalledWith(TEST_SETTINGS, 800);
    expect(harness.current.schedulingUid).toBeNull();
  });
});
