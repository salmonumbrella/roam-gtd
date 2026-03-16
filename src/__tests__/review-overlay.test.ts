import { JSDOM } from "jsdom";
import ReactDOM from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GtdSettings } from "../settings";
import type { createGtdStore } from "../store";
import { TEST_SETTINGS } from "./fixtures";

// Mock only ReviewWizard — real React rendering happens so the host wrapper's
// useState/setState actually work.
const mocks = vi.hoisted(() => {
  const ReviewWizard = vi.fn(() => null);
  return { ReviewWizard };
});

vi.mock("../components/ReviewWizard", () => ({
  ReviewWizard: mocks.ReviewWizard,
}));

// Import after mocks are set up
import { createReviewOverlayController } from "../review/overlay";

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lastReviewWizardProps(): any {
  const calls = mocks.ReviewWizard.mock.calls as Array<Array<unknown>>;
  return calls.at(-1)![0];
}

type GtdStore = ReturnType<typeof createGtdStore>;

function makeStore(): GtdStore {
  return {
    dispose: vi.fn(),
    getSnapshot: vi.fn(() => ({
      backHalfHydrated: false,
      backHalfLoadedAt: null,
      completedThisWeek: [],
      deferred: [],
      delegated: [],
      inbox: [],
      lastWeekMetrics: null,
      loading: false,
      nextActions: [],
      projects: [],
      projectsHydrated: false,
      projectsLoadedAt: null,
      projectsLoading: false,
      someday: [],
      stale: [],
      ticklerItems: [],
      topGoals: [],
      triagedThisWeekCount: 0,
      waitingFor: [],
      workflowHydrated: false,
    })),
    refresh: vi.fn(async () => {}),
    scheduleRefresh: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  };
}

function makeT() {
  return (key: string) => key;
}

function makeOpenProps(overrides: Partial<{ onAfterClose: () => void }> = {}) {
  return {
    mode: "weekly" as const,
    onAfterClose: vi.fn(),
    settings: TEST_SETTINGS as GtdSettings,
    store: makeStore(),
    t: makeT(),
    ...overrides,
  };
}

// ----------------------------------------------------------------
// Setup / teardown
// ----------------------------------------------------------------

let dom: JSDOM;
let requestIdleCallback: ReturnType<typeof vi.fn>;
let cancelIdleCallback: ReturnType<typeof vi.fn>;
let pendingHandles: Map<
  number,
  (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void
>;
let nextHandle: number;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let renderSpy: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let unmountSpy: any;

function flushIdleCallbacks(): void {
  const entries = [...pendingHandles.entries()];
  pendingHandles.clear();
  for (const [, cb] of entries) {
    cb({ didTimeout: false, timeRemaining: () => 50 });
  }
}

beforeEach(() => {
  dom = new JSDOM("<!DOCTYPE html><body></body>");
  pendingHandles = new Map();
  nextHandle = 100;

  requestIdleCallback = vi.fn(
    (cb: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void) => {
      const handle = nextHandle++;
      pendingHandles.set(handle, cb);
      return handle;
    },
  );

  cancelIdleCallback = vi.fn((handle: number) => {
    pendingHandles.delete(handle);
  });

  // Use jsdom's full window (React needs HTMLElement, Node, etc. for instanceof
  // checks during rendering) but patch in requestIdleCallback which jsdom lacks.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = dom.window as any;
  win.requestIdleCallback = requestIdleCallback;
  win.cancelIdleCallback = cancelIdleCallback;
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", dom.window.document);

  renderSpy = vi.spyOn(ReactDOM, "render");
  unmountSpy = vi.spyOn(ReactDOM, "unmountComponentAtNode");

  mocks.ReviewWizard.mockClear();
});

afterEach(() => {
  renderSpy.mockRestore();
  unmountSpy.mockRestore();
  vi.unstubAllGlobals();
  dom.window.close();
  pendingHandles.clear();
});

// ----------------------------------------------------------------
// Tests
// ----------------------------------------------------------------

describe("createReviewOverlayController", () => {
  describe("scheduleMount()", () => {
    it("uses requestIdleCallback to defer mounting", () => {
      const controller = createReviewOverlayController();
      controller.scheduleMount();

      expect(requestIdleCallback).toHaveBeenCalledTimes(1);
      expect(renderSpy).not.toHaveBeenCalled();

      controller.dispose();
    });

    it("mounts host component when idle fires — ReviewWizard not rendered (no store)", () => {
      const controller = createReviewOverlayController();
      controller.scheduleMount();

      flushIdleCallbacks();

      // ReactDOM.render called once to mount the host wrapper
      expect(renderSpy).toHaveBeenCalledTimes(1);
      // ReviewWizard NOT called because host returns null when no store is set
      expect(mocks.ReviewWizard).not.toHaveBeenCalled();

      controller.dispose();
    });

    it("appends a container div with correct ID to document.body", () => {
      const controller = createReviewOverlayController();
      controller.scheduleMount();
      flushIdleCallbacks();

      const container = dom.window.document.getElementById("roam-gtd-review-root");
      expect(container).not.toBeNull();

      controller.dispose();
    });

    it("is idempotent — repeated calls do not double-mount", () => {
      const controller = createReviewOverlayController();
      controller.scheduleMount();
      controller.scheduleMount();
      controller.scheduleMount();

      flushIdleCallbacks();

      expect(requestIdleCallback).toHaveBeenCalledTimes(1);
      expect(renderSpy).toHaveBeenCalledTimes(1);

      controller.dispose();
    });
  });

  describe("open(props)", () => {
    it("renders ReviewWizard with isOpen=true and provided props", () => {
      const controller = createReviewOverlayController();
      controller.scheduleMount();
      flushIdleCallbacks();

      const props = makeOpenProps();
      controller.open(props);

      expect(mocks.ReviewWizard).toHaveBeenCalled();
      const lastCall = lastReviewWizardProps();
      expect(lastCall.isOpen).toBe(true);
      expect(lastCall.settings).toBe(props.settings);
      expect(lastCall.store).toBe(props.store);
      expect(lastCall.mode).toBe("weekly");

      controller.dispose();
    });

    it("returns a close function", () => {
      const controller = createReviewOverlayController();
      controller.scheduleMount();
      flushIdleCallbacks();

      const close = controller.open(makeOpenProps());
      expect(typeof close).toBe("function");

      controller.dispose();
    });

    it("mounts synchronously if scheduleMount() was never called", () => {
      const controller = createReviewOverlayController();
      const props = makeOpenProps();
      controller.open(props);

      expect(renderSpy).toHaveBeenCalled();
      expect(mocks.ReviewWizard).toHaveBeenCalled();
      const lastCall = lastReviewWizardProps();
      expect(lastCall.isOpen).toBe(true);

      controller.dispose();
    });

    it("mounts synchronously if idle callback has not yet fired", () => {
      const controller = createReviewOverlayController();
      controller.scheduleMount();
      // Idle callback NOT flushed — still pending

      controller.open(makeOpenProps());

      expect(renderSpy).toHaveBeenCalled();
      expect(mocks.ReviewWizard).toHaveBeenCalled();
      const lastCall = lastReviewWizardProps();
      expect(lastCall.isOpen).toBe(true);

      controller.dispose();
    });

    it("does not call ReactDOM.render again — open uses setState", () => {
      const controller = createReviewOverlayController();
      controller.scheduleMount();
      flushIdleCallbacks();

      renderSpy.mockClear();
      controller.open(makeOpenProps());

      // open() should NOT trigger another ReactDOM.render — it uses setState
      expect(renderSpy).not.toHaveBeenCalled();

      controller.dispose();
    });
  });

  describe("close function", () => {
    it("re-renders ReviewWizard with isOpen=false", () => {
      const controller = createReviewOverlayController();
      controller.scheduleMount();
      flushIdleCallbacks();

      const close = controller.open(makeOpenProps());
      mocks.ReviewWizard.mockClear();
      close();

      expect(mocks.ReviewWizard).toHaveBeenCalled();
      const lastCall = lastReviewWizardProps();
      expect(lastCall.isOpen).toBe(false);

      controller.dispose();
    });

    it("calls onAfterClose when close is invoked", () => {
      const controller = createReviewOverlayController();
      controller.scheduleMount();
      flushIdleCallbacks();

      const onAfterClose = vi.fn();
      const close = controller.open(makeOpenProps({ onAfterClose }));
      close();

      expect(onAfterClose).toHaveBeenCalledTimes(1);

      controller.dispose();
    });
  });

  describe("dispose()", () => {
    it("unmounts the React tree and removes the container from the DOM", () => {
      const controller = createReviewOverlayController();
      controller.scheduleMount();
      flushIdleCallbacks();

      controller.dispose();

      expect(unmountSpy).toHaveBeenCalledTimes(1);
      expect(dom.window.document.getElementById("roam-gtd-review-root")).toBeNull();
    });

    it("cancels a pending idle callback when disposed before idle fires", () => {
      const controller = createReviewOverlayController();
      controller.scheduleMount();

      expect(requestIdleCallback).toHaveBeenCalledTimes(1);
      expect(pendingHandles.size).toBe(1);

      controller.dispose();

      expect(cancelIdleCallback).toHaveBeenCalledTimes(1);
      // Flushing after dispose should NOT render anything
      flushIdleCallbacks();
      expect(renderSpy).not.toHaveBeenCalled();
    });

    it("does not throw when called without any mount", () => {
      const controller = createReviewOverlayController();
      expect(() => controller.dispose()).not.toThrow();
    });
  });
});
