import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getInboxActionForSingleKey } from "../index";

const mocks = vi.hoisted(() => {
  const settings = {
    agentDelegationWebhookUrl: "",
    dailyPlanParent: "[[Plans, Priorities]]",
    dailyReviewNotify: true,
    dailyReviewStaleDays: 2,
    delegateTargetTags: ["people", "agents"],
    hideProcessButton: false,
    hotkeyDelegate: "d",
    hotkeyDone: "e",
    hotkeyProject: "p",
    hotkeySomeday: "s",
    hotkeyWatch: "w",
    inboxPage: "Triage",
    locale: "en",
    reviewItemMode: "list",
    showTooltips: true,
    staleDays: 14,
    tagDelegated: "delegated",
    tagNextAction: "up",
    tagSomeday: "someday",
    tagWaitingFor: "watch",
    topGoalAttr: "Top Goal",
    triggerListPage: "Trigger List",
    weeklyReviewDay: 0,
    weeklyReviewNotify: true,
    weeklyReviewTime: "09:00",
  };

  const reviewOverlayController = {
    dispose: vi.fn(),
    open: vi.fn(() => vi.fn()),
    scheduleMount: vi.fn(),
  };

  return {
    createGtdStore: vi.fn(),
    createSettingsPanelConfig: vi.fn(() => ({ tabTitle: "GTD" })),
    createT: vi.fn(() => (key: string) => key),
    Dashboard: { displayName: "DashboardMock" },
    getSettings: vi.fn(() => settings),
    NextActionsModal: { displayName: "NextActionsModalMock" },
    removePageColorBridge: vi.fn(),
    renderOverlay: vi.fn(),
    resetTriageToaster: vi.fn(),
    reviewOverlayController,
    ReviewWizard: { displayName: "ReviewWizardMock" },
    settings,
    settingsEqual: vi.fn((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    spawnNextActionsIntoPage: vi.fn(() =>
      Promise.resolve({
        groupCount: 0,
        itemCount: 0,
        pageTitle: "February 25th, 2026",
        parentUid: "parent-uid",
      }),
    ),
    spawnNextActionsIntoToday: vi.fn(() =>
      Promise.resolve({
        groupCount: 0,
        itemCount: 0,
        pageTitle: "February 25th, 2026",
        parentUid: "parent-uid",
      }),
    ),
  };
});

vi.mock("react-dom", () => ({
  default: { render: vi.fn(), unmountComponentAtNode: vi.fn() },
  render: vi.fn(),
  unmountComponentAtNode: vi.fn(),
}));

vi.mock("roamjs-components/util/renderOverlay", () => ({
  default: mocks.renderOverlay,
}));

vi.mock("roamjs-components/util/runExtension", () => ({
  default: (onload: unknown) => onload,
}));

vi.mock("../components/Dashboard", () => ({
  Dashboard: mocks.Dashboard,
}));

vi.mock("../triage/step-logic", () => ({
  resetTriageToaster: mocks.resetTriageToaster,
}));

vi.mock("../components/NextActionsModal", () => ({
  NextActionsModal: mocks.NextActionsModal,
}));

vi.mock("../components/PageColorBridge", () => ({
  removePageColorBridge: mocks.removePageColorBridge,
}));

vi.mock("../components/ReviewWizard", () => ({
  ReviewWizard: mocks.ReviewWizard,
}));

vi.mock("../review/overlay", () => ({
  createReviewOverlayController: () => mocks.reviewOverlayController,
}));

vi.mock("../i18n", () => ({
  createT: mocks.createT,
}));

vi.mock("../planning/daily-note-next-actions", () => ({
  spawnNextActionsIntoPage: mocks.spawnNextActionsIntoPage,
  spawnNextActionsIntoToday: mocks.spawnNextActionsIntoToday,
}));

vi.mock("../settings", () => ({
  createSettingsPanelConfig: mocks.createSettingsPanelConfig,
  getSettings: mocks.getSettings,
}));

vi.mock("../store", () => ({
  createGtdStore: mocks.createGtdStore,
  settingsEqual: mocks.settingsEqual,
}));

interface Command {
  callback: () => void;
  label: string;
}

interface Harness {
  addEventListener: ReturnType<typeof vi.fn>;
  addPullWatch: ReturnType<typeof vi.fn>;
  blueprintToasterShow: ReturnType<typeof vi.fn>;
  commands: Array<Command>;
  focus: ReturnType<typeof vi.fn>;
  removeCommand: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  removePullWatch: ReturnType<typeof vi.fn>;
  store: {
    dispose: ReturnType<typeof vi.fn>;
    getSnapshot: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    scheduleRefresh: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  };
  styleEl: {
    id: string;
    remove: ReturnType<typeof vi.fn>;
    textContent: string;
  };
  unload: () => void;
}

function createEmptySnapshot(): {
  backHalfHydrated: boolean;
  backHalfLoadedAt: null;
  completedThisWeek: Array<unknown>;
  deferred: Array<unknown>;
  delegated: Array<unknown>;
  inbox: Array<unknown>;
  lastWeekMetrics: null;
  loading: boolean;
  nextActions: Array<unknown>;
  projects: Array<unknown>;
  projectsHydrated: boolean;
  projectsLoading: boolean;
  someday: Array<unknown>;
  stale: Array<unknown>;
  ticklerItems: Array<unknown>;
  topGoals: Array<unknown>;
  triagedThisWeekCount: number;
  waitingFor: Array<unknown>;
} {
  return {
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
    projectsLoading: false,
    someday: [],
    stale: [],
    ticklerItems: [],
    topGoals: [],
    triagedThisWeekCount: 0,
    waitingFor: [],
  };
}

async function startExtension(): Promise<Harness> {
  const addEventListener = vi.fn();
  const addPullWatch = vi.fn();
  const removePullWatch = vi.fn();
  const removeEventListener = vi.fn();
  const focus = vi.fn();
  const blueprintToasterShow = vi.fn();
  const commands: Array<Command> = [];
  const addCommand = vi.fn((command: Command) => {
    commands.push(command);
  });
  const removeCommand = vi.fn();

  const styleEl = {
    id: "",
    remove: vi.fn(),
    textContent: "",
  };

  const createElement = vi.fn(() => styleEl);
  const append = vi.fn();

  const store = {
    dispose: vi.fn(),
    getSnapshot: vi.fn(() => createEmptySnapshot()),
    refresh: vi.fn(() => Promise.resolve()),
    scheduleRefresh: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  };

  mocks.createGtdStore.mockReturnValue(store);

  const globalAny = globalThis as {
    document?: unknown;
    window?: unknown;
  };

  globalAny.document = {
    activeElement: null,
    body: { appendChild: vi.fn() },
    createElement,
    head: {
      append,
    },
  };

  globalAny.window = {
    addEventListener,
    Blueprint: {
      Core: {
        OverlayToaster: {
          create: () => ({ show: blueprintToasterShow }),
        },
        Position: { TOP: "top" },
      },
    },
    clearInterval: globalThis.clearInterval,
    clearTimeout: globalThis.clearTimeout,
    focus,
    Notification: globalThis.Notification,
    removeEventListener,
    roamAlphaAPI: {
      data: {
        addPullWatch,
        removePullWatch,
      },
      ui: {
        commandPalette: {
          addCommand,
          removeCommand,
        },
      },
    },
    setInterval: globalThis.setInterval,
    setTimeout: globalThis.setTimeout,
  };

  const extensionApi = {
    settings: {
      panel: {
        create: vi.fn(),
      },
    },
  };

  const extensionModule = await import("../index");
  const run = extensionModule.default as unknown as (args: {
    extensionAPI: unknown;
  }) => void | Promise<void>;
  const lifecycle = (await run({ extensionAPI: extensionApi })) as { unload?: () => void } | void;

  return {
    addEventListener,
    addPullWatch,
    blueprintToasterShow,
    commands,
    focus,
    removeCommand,
    removeEventListener,
    removePullWatch,
    store,
    styleEl,
    unload: lifecycle?.unload ?? (() => undefined),
  };
}

function getCommand(commands: Array<Command>, label: string): Command {
  const command = commands.find((item) => item.label === label);
  if (!command) {
    throw new Error(`Missing command: ${label}`);
  }
  return command;
}

describe("index command wiring", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.resetModules();
    mocks.reviewOverlayController.open.mockReset().mockReturnValue(vi.fn());
    mocks.reviewOverlayController.scheduleMount.mockReset();
    mocks.reviewOverlayController.dispose.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    const globalAny = globalThis as {
      document?: unknown;
      window?: unknown;
    };
    globalAny.window = undefined;
    globalAny.document = undefined;
  });

  it("renders overlay before scheduling refresh to avoid blocking open", async () => {
    const harness = await startExtension();
    harness.store.refresh.mockClear();

    const openDashboard = getCommand(harness.commands, "GTD: Open Dashboard").callback;

    openDashboard();
    expect(mocks.renderOverlay).toHaveBeenCalledTimes(1);
    expect(harness.store.refresh).not.toHaveBeenCalled();
    expect(harness.store.scheduleRefresh).toHaveBeenCalledTimes(1);
    expect(harness.store.scheduleRefresh).toHaveBeenCalledWith(mocks.settings, 0);

    const renderOrder = mocks.renderOverlay.mock.invocationCallOrder[0];
    const scheduleOrder = harness.store.scheduleRefresh.mock.invocationCallOrder[0];

    expect(renderOrder).toBeLessThan(scheduleOrder);
  });

  it("lets the review session own inbox refresh when weekly review opens", async () => {
    const harness = await startExtension();
    harness.store.getSnapshot.mockReturnValue({
      ...createEmptySnapshot(),
      inbox: [{ ageDays: 1, uid: "inbox-uid" }],
    });
    harness.store.refresh.mockClear();

    const openWeeklyReview = getCommand(harness.commands, "GTD: Weekly Review").callback;
    openWeeklyReview();

    expect(harness.store.refresh).not.toHaveBeenCalled();
  });

  it("opens a dedicated next-actions modal from command palette", async () => {
    const harness = await startExtension();

    const openNextActions = getCommand(harness.commands, "GTD: Next Actions").callback;

    openNextActions();
    expect(mocks.renderOverlay).toHaveBeenCalledTimes(1);
    expect(harness.store.scheduleRefresh).toHaveBeenCalledTimes(1);
    expect(harness.store.scheduleRefresh).toHaveBeenCalledWith(mocks.settings, 0);

    const nextActionsOverlayArg = mocks.renderOverlay.mock.calls[0][0] as {
      Overlay: unknown;
      props: {
        onAfterClose?: () => void;
      };
    };

    expect(nextActionsOverlayArg.Overlay).toBe(mocks.NextActionsModal);
  });

  it("spawns grouped next actions into today's daily note from command palette", async () => {
    const harness = await startExtension();

    const spawnNextActions = getCommand(
      harness.commands,
      "GTD: Spawn Next Actions in Today",
    ).callback;

    spawnNextActions();
    await Promise.resolve();

    expect(mocks.spawnNextActionsIntoToday).toHaveBeenCalledTimes(1);
    expect(mocks.spawnNextActionsIntoToday).toHaveBeenCalledWith(mocks.settings);
    expect(harness.store.scheduleRefresh).toHaveBeenCalledWith(mocks.settings, 0);
  });

  it("spawns grouped next actions into tomorrow from command palette", async () => {
    const harness = await startExtension();
    vi.setSystemTime(new Date(2026, 1, 25, 12, 0, 0));

    const spawnNextActions = getCommand(
      harness.commands,
      "GTD: Spawn Next Actions for Tomorrow",
    ).callback;

    spawnNextActions();
    await Promise.resolve();

    expect(mocks.spawnNextActionsIntoPage).toHaveBeenCalledTimes(1);
    expect(mocks.spawnNextActionsIntoPage).toHaveBeenCalledWith(
      mocks.settings,
      "February 26th, 2026",
    );
    expect(harness.store.scheduleRefresh).toHaveBeenCalledWith(mocks.settings, 0);
  });

  it("shows loading and success toasts while spawning next actions", async () => {
    const harness = await startExtension();
    vi.setSystemTime(new Date(2026, 1, 25, 12, 0, 0));

    const spawnNextActions = getCommand(
      harness.commands,
      "GTD: Spawn Next Actions for Tomorrow",
    ).callback;

    spawnNextActions();
    await Promise.resolve();

    expect(harness.blueprintToasterShow).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "warning" }),
    );
    expect(harness.blueprintToasterShow).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "success" }),
    );
  });

  it("injects fixed-height Step 1 triage styles so long single blocks scroll instead of resizing the modal", async () => {
    const harness = await startExtension();

    const styles = harness.styleEl.textContent;
    expect(styles).toMatch(
      /--roam-gtd-review-dialog-height:\s*var\(--roam-gtd-theme-review-dialog-height,\s*520px\);/s,
    );
    expect(styles).toMatch(
      /\.roam-gtd-review-dialog \{[^}]*height:\s*var\(--roam-gtd-review-dialog-height\);[^}]*max-height:\s*var\(--roam-gtd-review-dialog-height\);[^}]*min-height:\s*var\(--roam-gtd-review-dialog-height\);[^}]*overflow:\s*hidden;[^}]*\}/s,
    );
    expect(styles).toMatch(
      /\.roam-gtd-review-dialog \.bp3-dialog-body \{[^}]*overflow-y:\s*hidden;[^}]*\}/s,
    );
    expect(styles).toMatch(
      /--roam-gtd-triage-columns-height:\s*var\(--roam-gtd-theme-triage-columns-height,\s*420px\);/s,
    );
    expect(styles).toMatch(
      /\.roam-gtd-dialog \.roam-gtd-triage-columns \{[^}]*height:\s*var\(--roam-gtd-triage-columns-height\);[^}]*max-height:\s*var\(--roam-gtd-triage-columns-height\);[^}]*\}/s,
    );
    expect(styles).toMatch(
      /\.roam-gtd-dialog \.roam-gtd-triage-left \{[^}]*overflow-y:\s*auto;[^}]*\}/s,
    );
    expect(styles).toMatch(
      /\.roam-gtd-dialog \.rm-api-render--block > [^{]*\.rm-block__input \{[^}]*overflow-wrap:\s*anywhere;[^}]*word-break:\s*break-word;[^}]*\}/s,
    );
  });

  it("expands focused workflow rows to reveal child blocks while editing", async () => {
    const harness = await startExtension();

    const styles = harness.styleEl.textContent;
    // Both :focus-within and --expanded class should expand rows
    expect(styles).toMatch(
      /\.roam-gtd-unified-row__block:focus-within,\s*\n?\.roam-gtd-unified-row__block--expanded \{[^}]*max-height:\s*none;[^}]*overflow:\s*visible;[^}]*\}/s,
    );
    expect(styles).toMatch(
      /\.roam-gtd-unified-row__block:focus-within \.roam-gtd-unified-row__native-block \.rm-block-children,\s*\n?\.roam-gtd-unified-row__block--expanded \.roam-gtd-unified-row__native-block \.rm-block-children \{[^}]*display:\s*block !important;[^}]*\}/s,
    );
    expect(styles).toMatch(/\.roam-gtd-unified-row__block:focus-within \.rm-block__input,/s);
    expect(styles).toMatch(/\.roam-gtd-unified-row__block--expanded \.rm-block__input,/s);
    expect(styles).toMatch(
      /\.roam-gtd-unified-row__block:focus-within[^}]+\.rm-block-children[^}]+\.rm-block__controls,\s*\n?\.roam-gtd-unified-row__block--expanded/s,
    );
    expect(styles).toMatch(
      /\.roam-gtd-unified-row__block:focus-within[^}]+\.rm-block-children[^}]+\.rm-block-separator,\s*\n?\.roam-gtd-unified-row__block--expanded/s,
    );
  });

  it("ignores repeated single-key inbox shortcuts while weekly review is open", async () => {
    const harness = await startExtension();
    const openReview = getCommand(harness.commands, "GTD: Weekly Review").callback;
    openReview();

    const keydownRegistration = harness.addEventListener.mock.calls.find(
      (call) => call[0] === "keydown",
    );
    expect(keydownRegistration).toBeTruthy();
    const keydownHandler = keydownRegistration?.[1] as (event: KeyboardEvent) => void;
    expect(typeof keydownHandler).toBe("function");

    const repeatPreventDefault = vi.fn();
    const repeatStopPropagation = vi.fn();
    const repeatStopImmediatePropagation = vi.fn();
    keydownHandler({
      altKey: false,
      ctrlKey: false,
      key: "r",
      metaKey: false,
      preventDefault: repeatPreventDefault,
      repeat: true,
      shiftKey: false,
      stopImmediatePropagation: repeatStopImmediatePropagation,
      stopPropagation: repeatStopPropagation,
      target: null,
    } as unknown as KeyboardEvent);
    expect(repeatPreventDefault).not.toHaveBeenCalled();
    expect(repeatStopPropagation).not.toHaveBeenCalled();
    expect(repeatStopImmediatePropagation).not.toHaveBeenCalled();

    const nonRepeatPreventDefault = vi.fn();
    const nonRepeatStopPropagation = vi.fn();
    const nonRepeatStopImmediatePropagation = vi.fn();
    keydownHandler({
      altKey: false,
      ctrlKey: false,
      key: "r",
      metaKey: false,
      preventDefault: nonRepeatPreventDefault,
      repeat: false,
      shiftKey: false,
      stopImmediatePropagation: nonRepeatStopImmediatePropagation,
      stopPropagation: nonRepeatStopPropagation,
      target: null,
    } as unknown as KeyboardEvent);
    expect(nonRepeatPreventDefault).toHaveBeenCalledTimes(1);
    expect(nonRepeatStopPropagation).toHaveBeenCalledTimes(1);
    expect(nonRepeatStopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(
      (globalThis as { window?: { __roamGtdPendingInboxShortcut?: string } }).window
        ?.__roamGtdPendingInboxShortcut,
    ).toBe("reference");
  });

  it("swallows unhandled modifier shortcuts so they never leak to the graph", async () => {
    const harness = await startExtension();
    const openReview = getCommand(harness.commands, "GTD: Weekly Review").callback;
    openReview();

    const keydownRegistration = harness.addEventListener.mock.calls.find(
      (call) => call[0] === "keydown",
    );
    expect(keydownRegistration).toBeTruthy();
    const keydownHandler = keydownRegistration?.[1] as (event: KeyboardEvent) => void;
    expect(typeof keydownHandler).toBe("function");

    const globalAny = globalThis as {
      document: { activeElement: unknown; body: unknown };
      window?: { __roamGtdPendingInboxShortcut?: string };
    };
    globalAny.document.activeElement = globalAny.document.body;

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const stopImmediatePropagation = vi.fn();
    keydownHandler({
      altKey: false,
      ctrlKey: true,
      key: "s",
      metaKey: false,
      preventDefault,
      repeat: false,
      shiftKey: false,
      stopImmediatePropagation,
      stopPropagation,
      target: null,
    } as unknown as KeyboardEvent);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(globalAny.window?.__roamGtdPendingInboxShortcut).toBeUndefined();
  });

  it("allows native text-editing shortcuts inside focused dialog fields", async () => {
    const harness = await startExtension();
    const openReview = getCommand(harness.commands, "GTD: Weekly Review").callback;
    openReview();

    const keydownRegistration = harness.addEventListener.mock.calls.find(
      (call) => call[0] === "keydown",
    );
    expect(keydownRegistration).toBeTruthy();
    const keydownHandler = keydownRegistration?.[1] as (event: KeyboardEvent) => void;
    expect(typeof keydownHandler).toBe("function");

    const globalAny = globalThis as {
      document: { activeElement: unknown; body: unknown };
      window?: { __roamGtdPendingInboxShortcut?: string };
    };
    const inputLikeElement = {
      classList: { contains: () => false },
      closest: (selector: string) => (selector === ".roam-gtd-dialog" ? {} : null),
      isContentEditable: false,
      nodeType: 1,
      tagName: "INPUT",
    };
    globalAny.document.activeElement = inputLikeElement;

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const stopImmediatePropagation = vi.fn();
    keydownHandler({
      altKey: false,
      ctrlKey: false,
      key: "a",
      metaKey: true,
      preventDefault,
      repeat: false,
      shiftKey: false,
      stopImmediatePropagation,
      stopPropagation,
      target: inputLikeElement,
    } as unknown as KeyboardEvent);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(stopImmediatePropagation).not.toHaveBeenCalled();
    expect(globalAny.window?.__roamGtdPendingInboxShortcut).toBeUndefined();
  });

  it("allows block collapse shortcuts while editing a dialog block", async () => {
    const harness = await startExtension();
    const openReview = getCommand(harness.commands, "GTD: Weekly Review").callback;
    openReview();

    const keydownRegistration = harness.addEventListener.mock.calls.find(
      (call) => call[0] === "keydown",
    );
    expect(keydownRegistration).toBeTruthy();
    const keydownHandler = keydownRegistration?.[1] as (event: KeyboardEvent) => void;
    expect(typeof keydownHandler).toBe("function");

    const globalAny = globalThis as {
      document: { activeElement: unknown; body: unknown };
      window?: { __roamGtdPendingInboxShortcut?: string };
    };
    const blockEditorElement = {
      classList: { contains: (className: string) => className === "rm-block-input" },
      closest: (selector: string) => (selector === ".roam-gtd-dialog" ? {} : null),
      isContentEditable: true,
      nodeType: 1,
      tagName: "TEXTAREA",
    };
    globalAny.document.activeElement = blockEditorElement;

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const stopImmediatePropagation = vi.fn();
    keydownHandler({
      altKey: false,
      ctrlKey: true,
      key: "i",
      metaKey: false,
      preventDefault,
      repeat: false,
      shiftKey: false,
      stopImmediatePropagation,
      stopPropagation,
      target: blockEditorElement,
    } as unknown as KeyboardEvent);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(stopImmediatePropagation).not.toHaveBeenCalled();
    expect(globalAny.window?.__roamGtdPendingInboxShortcut).toBeUndefined();
  });

  it("swallows advanced block search shortcut while editing a dialog block", async () => {
    const harness = await startExtension();
    const openReview = getCommand(harness.commands, "GTD: Weekly Review").callback;
    openReview();

    const keydownRegistration = harness.addEventListener.mock.calls.find(
      (call) => call[0] === "keydown",
    );
    expect(keydownRegistration).toBeTruthy();
    const keydownHandler = keydownRegistration?.[1] as (event: KeyboardEvent) => void;
    expect(typeof keydownHandler).toBe("function");

    const globalAny = globalThis as {
      document: { activeElement: unknown; body: unknown };
      window?: { __roamGtdPendingInboxShortcut?: string };
    };
    const blockEditorElement = {
      classList: { contains: (className: string) => className === "rm-block-input" },
      closest: (selector: string) => (selector === ".roam-gtd-dialog" ? {} : null),
      isContentEditable: true,
      nodeType: 1,
      tagName: "DIV",
    };
    globalAny.document.activeElement = blockEditorElement;

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const stopImmediatePropagation = vi.fn();
    keydownHandler({
      altKey: false,
      code: "Digit9",
      ctrlKey: true,
      key: "(",
      metaKey: false,
      preventDefault,
      repeat: false,
      shiftKey: true,
      stopImmediatePropagation,
      stopPropagation,
      target: blockEditorElement,
    } as unknown as KeyboardEvent);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(globalAny.window?.__roamGtdPendingInboxShortcut).toBeUndefined();
  });

  it("fires the weekly review notification and opens the review when clicked", async () => {
    vi.setSystemTime(new Date(2026, 2, 11, 10, 5));
    const notifications: Array<{ body: string; onclick: null | (() => void) }> = [];
    class MockNotification {
      static permission = "granted";
      onclick: null | (() => void) = null;

      constructor(_title: string, options: { body: string }) {
        notifications.push({ body: options.body, onclick: this.onclick });
        Object.defineProperty(notifications.at(-1)!, "onclick", {
          get: () => this.onclick,
          set: (value: null | (() => void)) => {
            this.onclick = value;
          },
        });
      }
    }

    vi.stubGlobal("Notification", MockNotification);
    mocks.getSettings.mockReturnValue({
      ...mocks.settings,
      dailyReviewNotify: false,
      dailyReviewStaleDays: 14,
      weeklyReviewDay: 3,
      weeklyReviewNotify: true,
      weeklyReviewTime: "10:00",
    });

    const harness = await startExtension();

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.body).toBe("Time for your weekly review. Click to start.");

    notifications[0]?.onclick?.();

    expect(harness.focus).toHaveBeenCalledTimes(1);
    expect(mocks.reviewOverlayController.open).toHaveBeenCalledTimes(1);
    expect(mocks.reviewOverlayController.open).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "weekly",
      }),
    );
  });

  it("fires the daily inbox notification when stale inbox items exist", async () => {
    vi.setSystemTime(new Date(2026, 2, 11, 9, 0));
    const notifications: Array<{ body: string }> = [];
    class MockNotification {
      static permission = "granted";
      onclick: null | (() => void) = null;

      constructor(_title: string, options: { body: string }) {
        notifications.push({ body: options.body });
      }
    }

    vi.stubGlobal("Notification", MockNotification);
    mocks.getSettings.mockReturnValue({
      ...mocks.settings,
      dailyReviewNotify: true,
      dailyReviewStaleDays: 7,
      weeklyReviewNotify: false,
    });

    const harness = await startExtension();
    harness.store.getSnapshot.mockReturnValue({
      ...createEmptySnapshot(),
      inbox: [{ ageDays: 10, uid: "stale-uid" }],
    });

    vi.advanceTimersByTime(60_000);

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.body).toBe("You have inbox items waiting. Click to triage.");
  });

  it("cleans up commands and teardown hooks on unload", async () => {
    const harness = await startExtension();

    harness.unload();

    expect(mocks.reviewOverlayController.dispose).toHaveBeenCalledTimes(1);
    expect(harness.store.dispose).toHaveBeenCalledTimes(1);
    expect(harness.removeCommand).toHaveBeenCalledTimes(7);
    expect(harness.removeCommand).toHaveBeenCalledWith({ label: "GTD: Daily Review" });
    expect(mocks.resetTriageToaster).toHaveBeenCalledTimes(1);
    expect(mocks.removePageColorBridge).toHaveBeenCalledTimes(1);
    expect(harness.styleEl.remove).toHaveBeenCalledTimes(1);
    expect(harness.removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function), true);
  });

  it("pre-mounts the review overlay during init", async () => {
    await startExtension();
    expect(mocks.reviewOverlayController.scheduleMount).toHaveBeenCalled();
  });
});

describe("getInboxActionForSingleKey", () => {
  const defaultSettings = {
    hotkeyDelegate: "d",
    hotkeyDone: "e",
    hotkeyProject: "p",
    hotkeySomeday: "s",
    hotkeyWatch: "w",
  };

  it("returns the user-configured action for its hotkey", () => {
    expect(getInboxActionForSingleKey("w", defaultSettings)).toBe("watch");
    expect(getInboxActionForSingleKey("d", defaultSettings)).toBe("delegate");
    expect(getInboxActionForSingleKey("s", defaultSettings)).toBe("someday");
    expect(getInboxActionForSingleKey("p", defaultSettings)).toBe("project");
    expect(getInboxActionForSingleKey("e", defaultSettings)).toBe("done");
  });

  it("maps 'u' to 'up' and 'r' to 'reference' by default", () => {
    expect(getInboxActionForSingleKey("u", defaultSettings)).toBe("up");
    expect(getInboxActionForSingleKey("r", defaultSettings)).toBe("reference");
  });

  it("returns user action when hotkeyDone shadows 'u'", () => {
    const settings = { ...defaultSettings, hotkeyDone: "u" };
    expect(getInboxActionForSingleKey("u", settings)).toBe("done");
  });

  it("returns user action when hotkeyWatch shadows 'r'", () => {
    const settings = { ...defaultSettings, hotkeyWatch: "r" };
    expect(getInboxActionForSingleKey("r", settings)).toBe("watch");
  });

  it("still maps the non-shadowed hardcoded key when only one is taken", () => {
    const settings = { ...defaultSettings, hotkeyDone: "u" };
    expect(getInboxActionForSingleKey("r", settings)).toBe("reference");
  });

  it("returns null for an unmapped key", () => {
    expect(getInboxActionForSingleKey("z", defaultSettings)).toBeNull();
  });

  it("returns null for an empty key", () => {
    expect(getInboxActionForSingleKey("", defaultSettings)).toBeNull();
    expect(getInboxActionForSingleKey("  ", defaultSettings)).toBeNull();
  });
});
