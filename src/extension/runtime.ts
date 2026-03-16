import { createT, type TranslatorFn } from "../i18n";
import { createReviewShortcutKeyDownHandler, type InboxShortcutAction } from "../review/shortcuts";
import { getSettings, type GtdSettings } from "../settings";
import { settingsEqual, type createGtdStore } from "../store";
import type { RoamExtensionAPI } from "../types/roam";
import { createDailyReviewNotifier, createReviewNotifier } from "./notifiers";

interface ExtensionWindowState {
  __roamGtdHandleInboxShortcut?: ((action: InboxShortcutAction) => boolean) | null;
  __roamGtdPendingInboxShortcut?: InboxShortcutAction | null;
}

type ExtensionWindow = Window & ExtensionWindowState;

export interface ExtensionRuntime {
  dispose: () => void;
  getCachedSettings: () => GtdSettings;
  getCachedTranslator: () => TranslatorFn;
  notifyGtdOverlayClosed: () => void;
  notifyGtdOverlayOpened: () => void;
  notifyReviewModalClosed: () => void;
  notifyReviewModalOpened: () => void;
  scheduleCachedSettingsRefresh: () => void;
  start: (args: { openDailyReview: () => void; openWeeklyReview: () => void }) => void;
}

interface CreateExtensionRuntimeArgs {
  api: RoamExtensionAPI;
  store: ReturnType<typeof createGtdStore>;
}

export function createExtensionRuntime({
  api,
  store,
}: CreateExtensionRuntimeArgs): ExtensionRuntime {
  const extensionWindow = window as ExtensionWindow;
  const canRegisterWindowKeydown =
    typeof window.addEventListener === "function" &&
    typeof window.removeEventListener === "function";
  const scheduledTimeouts = new Set<number>();
  let cachedSettings = getSettings(api);
  let cachedTranslator = createT(cachedSettings.locale);
  let activeGtdOverlayCount = 0;
  let activeReviewModalCount = 0;
  let reviewNotifier: ReturnType<typeof createReviewNotifier> | null = null;
  let dailyReviewNotifier: ReturnType<typeof createDailyReviewNotifier> | null = null;
  let started = false;

  const onReviewShortcutKeyDown = createReviewShortcutKeyDownHandler({
    dispatchInboxShortcut: (action) => {
      if (typeof extensionWindow.__roamGtdHandleInboxShortcut === "function") {
        const handled = extensionWindow.__roamGtdHandleInboxShortcut(action);
        if (handled) {
          return;
        }
      }
      extensionWindow.__roamGtdPendingInboxShortcut = action;
    },
    getActiveReviewOverlayCount: () => activeReviewModalCount,
    getCachedSettings: () => cachedSettings,
  });

  const scheduleTimeout = (callback: () => void, delayMs = 0): number => {
    const timeoutId = window.setTimeout(() => {
      scheduledTimeouts.delete(timeoutId);
      callback();
    }, delayMs);
    scheduledTimeouts.add(timeoutId);
    return timeoutId;
  };

  const scheduleCachedSettingsRefresh = (): void => {
    scheduleTimeout(() => {
      const nextSettings = getSettings(api);
      if (!settingsEqual(nextSettings, cachedSettings)) {
        cachedSettings = nextSettings;
        cachedTranslator = createT(nextSettings.locale);
      }
    });
  };

  const notifyGtdOverlayOpened = (): void => {
    activeGtdOverlayCount += 1;
  };

  const notifyGtdOverlayClosed = (): void => {
    if (activeGtdOverlayCount === 0) {
      return;
    }
    activeGtdOverlayCount -= 1;
  };

  const notifyReviewModalOpened = (): void => {
    activeReviewModalCount += 1;
  };

  const notifyReviewModalClosed = (): void => {
    if (activeReviewModalCount === 0) {
      return;
    }
    activeReviewModalCount -= 1;
  };

  const start = ({
    openDailyReview,
    openWeeklyReview,
  }: {
    openDailyReview: () => void;
    openWeeklyReview: () => void;
  }): void => {
    if (started) {
      return;
    }
    started = true;

    if (canRegisterWindowKeydown) {
      window.addEventListener("keydown", onReviewShortcutKeyDown, true);
    }

    reviewNotifier = createReviewNotifier(() => cachedSettings, openWeeklyReview);
    reviewNotifier.start();

    dailyReviewNotifier = createDailyReviewNotifier(
      () => cachedSettings,
      () => store,
      openDailyReview,
    );
    dailyReviewNotifier.start();
  };

  const dispose = (): void => {
    reviewNotifier?.stop();
    dailyReviewNotifier?.stop();
    reviewNotifier = null;
    dailyReviewNotifier = null;

    for (const timeoutId of scheduledTimeouts) {
      window.clearTimeout(timeoutId);
    }
    scheduledTimeouts.clear();

    extensionWindow.__roamGtdHandleInboxShortcut = null;
    extensionWindow.__roamGtdPendingInboxShortcut = null;

    if (canRegisterWindowKeydown) {
      window.removeEventListener("keydown", onReviewShortcutKeyDown, true);
    }

    activeGtdOverlayCount = 0;
    activeReviewModalCount = 0;
    started = false;
  };

  return {
    dispose,
    getCachedSettings: () => cachedSettings,
    getCachedTranslator: () => cachedTranslator,
    notifyGtdOverlayClosed,
    notifyGtdOverlayOpened,
    notifyReviewModalClosed,
    notifyReviewModalOpened,
    scheduleCachedSettingsRefresh,
    start,
  };
}
