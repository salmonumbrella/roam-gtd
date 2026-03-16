import type { TranslatorFn } from "../../i18n";
import type { GtdSettings } from "../../settings";
import type { createGtdStore } from "../../store";
import type {
  ReviewWizardFooterButton,
  ReviewWizardFooterLegendSegment,
} from "../wizard-navigation";
import type { ReviewWizardMode, WizardStep, WizardStepKey } from "../wizard-support";

export type ReviewControllerDomain = "inbox" | "projects" | "workflow" | "tickler" | "dashboard";

export interface ReviewStepSlotSnapshot {
  error: Error | null;
  mode: "error" | "loading" | "ready";
  retryLabelKey?: "next" | "nextStep";
}

export interface ReviewControllerSnapshot {
  footer: {
    leftAction: ReviewWizardFooterButton | null;
    rightAction: ReviewWizardFooterButton | null;
  };
  header: {
    legendSegments: Array<ReviewWizardFooterLegendSegment> | null;
    progressValue: number;
    title: string;
  };
  stepSlot: ReviewStepSlotSnapshot;
}

export interface ReviewStepController<TStepKey extends WizardStepKey = WizardStepKey> {
  activate(stepKey: TStepKey): Promise<void>;
  deactivate(stepKey: TStepKey): void;
  dispose(): void;
  readonly domainKey: ReviewControllerDomain;
  getSnapshot(stepKey: TStepKey): ReviewControllerSnapshot;
  publishSnapshot(stepKey: TStepKey, snapshot: ReviewControllerSnapshot): void;
  reportInboxProgress?: (signal: { atEnd: boolean; current: number; total: number }) => void;
  subscribe(listener: () => void): () => void;
}

export interface ReviewControllerState {
  error: Error | null;
  snapshot: ReviewControllerSnapshot | null;
  status: "cold" | "warming" | "ready" | "error";
  stepKey: WizardStepKey | null;
}

export interface ReviewSessionSnapshot {
  activeStep: {
    controllerDomain: ReviewControllerDomain | "static";
    step: WizardStep;
    stepKey: WizardStepKey;
    stepSnapshot: ReviewControllerSnapshot | null;
  };
  activeStepKey: WizardStepKey;
  controllerStates: Record<ReviewControllerDomain, ReviewControllerState>;
  mode: ReviewWizardMode;
  steps: Array<WizardStep>;
}

export interface ReviewSession {
  activate(stepKey: WizardStepKey): Promise<void>;
  dispose(): void;
  getControllerDomainForStep(stepKey: WizardStepKey): ReviewControllerDomain | null;
  getControllerForStep(stepKey: WizardStepKey): ReviewStepController | null;
  getSnapshot(): ReviewSessionSnapshot;
  subscribe(listener: () => void): () => void;
}

export type ReviewControllerFactories = Record<ReviewControllerDomain, () => ReviewStepController>;

export interface CreateReviewSessionArgs {
  controllerFactories?: Partial<ReviewControllerFactories>;
  mode?: ReviewWizardMode;
  now?: Date;
  persistedStepIndex?: number;
  settings: GtdSettings;
  store: ReturnType<typeof createGtdStore>;
  t: TranslatorFn;
}
