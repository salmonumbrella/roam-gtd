import renderOverlay from "roamjs-components/util/renderOverlay";

import { Dashboard } from "../components/Dashboard";
import { NextActionsModal } from "../components/NextActionsModal";
import { formatRoamDate } from "../date-utils";
import {
  spawnNextActionsIntoPage,
  spawnNextActionsIntoToday,
} from "../planning/daily-note-next-actions";
import { rebuildPlansPriorities } from "../planning/plans-priorities";
import { createReviewOverlayController } from "../review/overlay";
import { getSettings } from "../settings";
import type { createGtdStore } from "../store";
import type { RoamExtensionAPI } from "../types/roam";
import type { ExtensionRuntime } from "./runtime";

type ToastIntent = "none" | "primary" | "success" | "warning" | "danger";

interface BlueprintToaster {
  show: (props: { intent: string; message: string; timeout: number }) => void;
}

let blueprintToaster: BlueprintToaster | null = null;

function getBlueprintToaster(): BlueprintToaster | null {
  if (blueprintToaster) {
    return blueprintToaster;
  }
  try {
    const bp = (window as unknown as Record<string, Record<string, unknown>>).Blueprint?.Core as
      | Record<string, unknown>
      | undefined;
    if (!bp) {
      return null;
    }
    const factory = bp.OverlayToaster ?? bp.Toaster;
    if (
      typeof factory !== "function" &&
      typeof (factory as Record<string, unknown>)?.create !== "function"
    ) {
      return null;
    }
    const create =
      typeof (factory as Record<string, unknown>).create === "function"
        ? (factory as { create: (opts: Record<string, unknown>) => BlueprintToaster }).create
        : (factory as unknown as (opts: Record<string, unknown>) => BlueprintToaster);
    blueprintToaster = create({ position: (bp.Position as Record<string, string>)?.TOP ?? "top" });
  } catch {
    // Blueprint not available in this environment.
  }
  return blueprintToaster;
}

function showRoamToast(content: string, intent: ToastIntent = "none"): void {
  try {
    getBlueprintToaster()?.show({ intent, message: content, timeout: 2500 });
  } catch {
    // Toast failures should not block commands.
  }
}

export interface ExtensionActions {
  openDailyReview: () => void;
  openDashboard: () => void;
  openNextActions: () => void;
  openWeeklyReview: () => void;
  rebuildPlansPriorities: () => void;
  spawnTodayNextActions: () => void;
  spawnTomorrowNextActions: () => void;
}

interface CreateExtensionActionsArgs {
  api: RoamExtensionAPI;
  reviewOverlay: ReturnType<typeof createReviewOverlayController>;
  runtime: ExtensionRuntime;
  store: ReturnType<typeof createGtdStore>;
}

export function createExtensionActions({
  api,
  reviewOverlay,
  runtime,
  store,
}: CreateExtensionActionsArgs): ExtensionActions {
  const openWeeklyReview = (): void => {
    const settings = runtime.getCachedSettings();
    const t = runtime.getCachedTranslator();
    runtime.notifyGtdOverlayOpened();
    runtime.notifyReviewModalOpened();
    try {
      reviewOverlay.open({
        mode: "weekly",
        onAfterClose: () => {
          runtime.notifyReviewModalClosed();
          runtime.notifyGtdOverlayClosed();
        },
        settings,
        store,
        t,
      });
      runtime.scheduleCachedSettingsRefresh();
    } catch (error) {
      runtime.notifyReviewModalClosed();
      runtime.notifyGtdOverlayClosed();
      throw error;
    }
  };

  const openDailyReview = (): void => {
    const settings = runtime.getCachedSettings();
    const t = runtime.getCachedTranslator();
    runtime.notifyGtdOverlayOpened();
    runtime.notifyReviewModalOpened();
    try {
      reviewOverlay.open({
        mode: "daily",
        onAfterClose: () => {
          runtime.notifyReviewModalClosed();
          runtime.notifyGtdOverlayClosed();
        },
        settings,
        store,
        t,
      });
      runtime.scheduleCachedSettingsRefresh();
    } catch (error) {
      runtime.notifyReviewModalClosed();
      runtime.notifyGtdOverlayClosed();
      throw error;
    }
  };

  const openDashboard = (): void => {
    const settings = runtime.getCachedSettings();
    const t = runtime.getCachedTranslator();
    runtime.notifyGtdOverlayOpened();
    try {
      renderOverlay({
        Overlay: Dashboard,
        props: {
          onAfterClose: runtime.notifyGtdOverlayClosed,
          onOpenReview: openWeeklyReview,
          settings,
          store,
          t,
        },
      });
      store.scheduleRefresh(settings, 0);
      runtime.scheduleCachedSettingsRefresh();
    } catch (error) {
      runtime.notifyGtdOverlayClosed();
      throw error;
    }
  };

  const openNextActions = (): void => {
    const settings = runtime.getCachedSettings();
    const t = runtime.getCachedTranslator();
    runtime.notifyGtdOverlayOpened();
    try {
      renderOverlay({
        Overlay: NextActionsModal,
        props: {
          onAfterClose: runtime.notifyGtdOverlayClosed,
          settings,
          store,
          t,
        },
      });
      store.scheduleRefresh(settings, 0);
      runtime.scheduleCachedSettingsRefresh();
    } catch (error) {
      runtime.notifyGtdOverlayClosed();
      throw error;
    }
  };

  const spawnTodayNextActions = (): void => {
    const settings = getSettings(api);
    showRoamToast("Spawning next actions into today", "warning");
    void spawnNextActionsIntoToday(settings)
      .then((result) => {
        store.scheduleRefresh(settings, 0);
        showRoamToast(
          `Spawned ${result.itemCount} next actions into ${result.pageTitle}`,
          "success",
        );
        // eslint-disable-next-line no-console -- command palette action feedback
        console.log("[RoamGTD] Spawned next actions in daily note:", result);
      })
      .catch((error) => {
        showRoamToast("Failed to spawn next actions into today", "danger");
        // eslint-disable-next-line no-console -- surface failures without breaking extension runtime
        console.error("[RoamGTD] Failed to spawn next actions into daily note", error);
      });
  };

  const spawnTomorrowNextActions = (): void => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const targetTitle = formatRoamDate(tomorrow);
    const settings = getSettings(api);
    showRoamToast(`Spawning next actions into ${targetTitle}`, "warning");
    void spawnNextActionsIntoPage(settings, targetTitle)
      .then((result) => {
        store.scheduleRefresh(settings, 0);
        showRoamToast(
          `Spawned ${result.itemCount} next actions into ${result.pageTitle}`,
          "success",
        );
        // eslint-disable-next-line no-console -- command palette action feedback
        console.log("[RoamGTD] Spawned next actions into tomorrow:", result);
      })
      .catch((error) => {
        showRoamToast(`Failed to spawn next actions into ${targetTitle}`, "danger");
        // eslint-disable-next-line no-console -- surface failures without breaking extension runtime
        console.error("[RoamGTD] Failed to spawn next actions into tomorrow", error);
      });
  };

  const rebuildPlansPrioritiesAction = (): void => {
    void rebuildPlansPriorities(runtime.getCachedSettings()).catch((error) => {
      // eslint-disable-next-line no-console -- surface failures without breaking extension runtime
      console.error("[RoamGTD] Failed to rebuild Plans & Priorities", error);
    });
  };

  return {
    openDailyReview,
    openDashboard,
    openNextActions,
    openWeeklyReview,
    rebuildPlansPriorities: rebuildPlansPrioritiesAction,
    spawnTodayNextActions,
    spawnTomorrowNextActions,
  };
}

export function resetExtensionActionToaster(): void {
  blueprintToaster = null;
}
