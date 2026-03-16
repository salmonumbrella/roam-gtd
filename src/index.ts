import runExtension from "roamjs-components/util/runExtension";

import { removePageColorBridge } from "./components/PageColorBridge";
import { createExtensionActions, resetExtensionActionToaster } from "./extension/actions";
import {
  buildExtensionCommands,
  registerExtensionCommands,
  type CommandPaletteApi,
} from "./extension/commands";
import { createExtensionRuntime } from "./extension/runtime";
import { mountExtensionStyles } from "./extension/styles";
import { createReviewOverlayController } from "./review/overlay";
import { createSettingsPanelConfig } from "./settings";
import { createGtdStore } from "./store";
import { resetTriageToaster } from "./triage/step-logic";
import type { RoamExtensionAPI } from "./types/roam";

export { getInboxActionForSingleKey } from "./review/shortcuts";

export default runExtension(async ({ extensionAPI }) => {
  const api = extensionAPI as RoamExtensionAPI;
  const store = createGtdStore();
  const reviewOverlay = createReviewOverlayController();
  const styleEl = mountExtensionStyles();
  const commandPalette = window.roamAlphaAPI.ui.commandPalette as CommandPaletteApi;

  api.settings.panel.create(createSettingsPanelConfig(undefined, api));

  const runtime = createExtensionRuntime({ api, store });
  const actions = createExtensionActions({
    api,
    reviewOverlay,
    runtime,
    store,
  });

  const unregisterCommands = registerExtensionCommands(
    commandPalette,
    buildExtensionCommands({
      onOpenDailyReview: actions.openDailyReview,
      onOpenDashboard: actions.openDashboard,
      onOpenNextActions: actions.openNextActions,
      onOpenWeeklyReview: actions.openWeeklyReview,
      onRebuildPlansPriorities: actions.rebuildPlansPriorities,
      onSpawnTodayNextActions: actions.spawnTodayNextActions,
      onSpawnTomorrowNextActions: actions.spawnTomorrowNextActions,
    }),
  );

  void store.refresh(runtime.getCachedSettings(), { scope: "inboxOnly" });
  reviewOverlay.scheduleMount();

  runtime.start({
    openDailyReview: actions.openDailyReview,
    openWeeklyReview: actions.openWeeklyReview,
  });

  return {
    unload: () => {
      runtime.dispose();
      reviewOverlay.dispose();
      store.dispose();
      unregisterCommands();
      resetExtensionActionToaster();
      resetTriageToaster();
      removePageColorBridge();
      styleEl.remove();
    },
  };
});
