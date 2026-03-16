import type React from "react";

import type { TranslatorFn } from "../../../i18n";
import type { ReviewSession } from "../../../review/session/types";
import type { WizardStepKey } from "../../../review/wizard-support";
import type { GtdSettings } from "../../../settings";
import type { createGtdStore } from "../../../store";

export interface ReviewWizardStepControls {
  handleBack?: () => boolean;
  handleForward?: () => boolean;
  handlePreviousItem?: () => void;
  saveSummary?: () => Promise<void> | void;
}

export interface ReviewWizardContainerProps<TStepKey extends WizardStepKey> {
  activeControlsRef: React.MutableRefObject<ReviewWizardStepControls | null>;
  isLastStep: boolean;
  session: ReviewSession;
  settings: GtdSettings;
  stepCount: number;
  stepIndex: number;
  stepKey: TStepKey;
  store: ReturnType<typeof createGtdStore>;
  t: TranslatorFn;
}

export function publishStepControls(
  activeControlsRef: React.MutableRefObject<ReviewWizardStepControls | null>,
  controls: ReviewWizardStepControls,
): () => void {
  activeControlsRef.current = controls;

  return () => {
    if (activeControlsRef.current === controls) {
      activeControlsRef.current = null;
    }
  };
}
