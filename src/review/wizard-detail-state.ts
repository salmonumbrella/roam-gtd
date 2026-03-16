import { useCallback, useMemo, useState } from "react";

import type { PersonEntry } from "../people";
import type { TicklerGroup } from "../types";
import {
  getProjectsDetailChromeState,
  getProjectsDetailDialogTitle,
  type WizardStepKey,
} from "./wizard-support";

export type ReviewWizardDetailKind = "none" | "person" | "project" | "tickler";

export type ReviewWizardDetailBackAction =
  | "closePersonDetail"
  | "closeProjectDetail"
  | "closeTicklerDetail"
  | "wizard";

export interface ReviewWizardDetailSelectionState {
  personDetailUid: string | null;
  ticklerDetailPageUid: string | null;
}

export interface ReviewWizardDetailStateArgs extends ReviewWizardDetailSelectionState {
  activeProjectPageTitle: string | null | undefined;
  bodyTicklerGroups: Array<TicklerGroup>;
  delegatedPeople: Array<PersonEntry>;
  isProjectDetailOpen: boolean;
  stateTicklerGroups: Array<TicklerGroup>;
  stepKey: WizardStepKey;
  stepTitle: string;
}

export interface ReviewWizardDetailState {
  activeDetailKind: ReviewWizardDetailKind;
  activePersonDetail: PersonEntry | null;
  activeTicklerDetail: TicklerGroup | null;
  backAction: ReviewWizardDetailBackAction;
  chromeState: ReturnType<typeof getProjectsDetailChromeState>;
  dialogTitleText: string;
  isAnyDetailOpen: boolean;
  isPersonDetailOpen: boolean;
  isProjectDetailOpen: boolean;
  isTicklerDetailOpen: boolean;
}

export interface UseReviewWizardDetailStateArgs extends Omit<
  ReviewWizardDetailStateArgs,
  "personDetailUid" | "ticklerDetailPageUid"
> {
  initialSelectionState?: Partial<ReviewWizardDetailSelectionState>;
}

export interface UseReviewWizardDetailStateResult extends ReviewWizardDetailState {
  closeActiveDetail: () => ReviewWizardDetailBackAction;
  closePersonDetail: () => void;
  closeTicklerDetail: () => void;
  openPersonDetail: (uid: string) => void;
  openTicklerDetail: (pageUid: string) => void;
  personDetailUid: string | null;
  resetDetailSelection: () => void;
  selectionState: ReviewWizardDetailSelectionState;
  ticklerDetailPageUid: string | null;
}

function resolveTicklerDetail(
  pageUid: string | null,
  bodyTicklerGroups: Array<TicklerGroup>,
  stateTicklerGroups: Array<TicklerGroup>,
): TicklerGroup | null {
  if (pageUid == null) {
    return null;
  }

  return (
    bodyTicklerGroups.find((group) => group.dailyPageUid === pageUid) ??
    stateTicklerGroups.find((group) => group.dailyPageUid === pageUid) ??
    null
  );
}

export function getReviewWizardDetailState(
  args: ReviewWizardDetailStateArgs,
): ReviewWizardDetailState {
  const activePersonDetail =
    args.stepKey !== "waitingDelegated" || args.personDetailUid == null
      ? null
      : (args.delegatedPeople.find((person) => person.uid === args.personDetailUid) ?? null);
  const activeTicklerDetail =
    args.stepKey !== "tickler"
      ? null
      : resolveTicklerDetail(
          args.ticklerDetailPageUid,
          args.bodyTicklerGroups,
          args.stateTicklerGroups,
        );
  const isPersonDetailOpen = activePersonDetail != null;
  const isTicklerDetailOpen = activeTicklerDetail != null;
  const isProjectDetailOpen =
    (args.stepKey === "projects" || args.stepKey === "stats") && args.isProjectDetailOpen;

  const activeDetailKind: ReviewWizardDetailKind = isPersonDetailOpen
    ? "person"
    : isTicklerDetailOpen
      ? "tickler"
      : isProjectDetailOpen
        ? "project"
        : "none";
  const isAnyDetailOpen = activeDetailKind !== "none";
  const chromeState = getProjectsDetailChromeState(isAnyDetailOpen);

  const dialogTitleText =
    activeDetailKind === "person"
      ? (activePersonDetail?.title ?? args.stepTitle)
      : activeDetailKind === "tickler"
        ? (activeTicklerDetail?.dailyTitle ?? args.stepTitle)
        : activeDetailKind === "project"
          ? getProjectsDetailDialogTitle(args.stepTitle, args.activeProjectPageTitle)
          : args.stepTitle;

  const backAction: ReviewWizardDetailBackAction =
    activeDetailKind === "person"
      ? "closePersonDetail"
      : activeDetailKind === "tickler"
        ? "closeTicklerDetail"
        : activeDetailKind === "project"
          ? "closeProjectDetail"
          : "wizard";

  return {
    activeDetailKind,
    activePersonDetail,
    activeTicklerDetail,
    backAction,
    chromeState,
    dialogTitleText,
    isAnyDetailOpen,
    isPersonDetailOpen,
    isProjectDetailOpen,
    isTicklerDetailOpen,
  };
}

export function useReviewWizardDetailState(
  args: UseReviewWizardDetailStateArgs,
): UseReviewWizardDetailStateResult {
  const [selectionState, setSelectionState] = useState<ReviewWizardDetailSelectionState>(() => ({
    personDetailUid: args.initialSelectionState?.personDetailUid ?? null,
    ticklerDetailPageUid: args.initialSelectionState?.ticklerDetailPageUid ?? null,
  }));

  const openPersonDetail = useCallback((uid: string) => {
    setSelectionState((current) =>
      current.personDetailUid === uid ? current : { ...current, personDetailUid: uid },
    );
  }, []);

  const closePersonDetail = useCallback(() => {
    setSelectionState((current) =>
      current.personDetailUid == null ? current : { ...current, personDetailUid: null },
    );
  }, []);

  const openTicklerDetail = useCallback((pageUid: string) => {
    setSelectionState((current) =>
      current.ticklerDetailPageUid === pageUid
        ? current
        : { ...current, ticklerDetailPageUid: pageUid },
    );
  }, []);

  const closeTicklerDetail = useCallback(() => {
    setSelectionState((current) =>
      current.ticklerDetailPageUid == null ? current : { ...current, ticklerDetailPageUid: null },
    );
  }, []);

  const resetDetailSelection = useCallback(() => {
    setSelectionState((current) =>
      current.personDetailUid == null && current.ticklerDetailPageUid == null
        ? current
        : { personDetailUid: null, ticklerDetailPageUid: null },
    );
  }, []);

  const derivedState = useMemo(
    () =>
      getReviewWizardDetailState({
        ...args,
        personDetailUid: selectionState.personDetailUid,
        ticklerDetailPageUid: selectionState.ticklerDetailPageUid,
      }),
    [args, selectionState.personDetailUid, selectionState.ticklerDetailPageUid],
  );

  const closeActiveDetail = useCallback((): ReviewWizardDetailBackAction => {
    if (derivedState.backAction === "closePersonDetail") {
      closePersonDetail();
    } else if (derivedState.backAction === "closeTicklerDetail") {
      closeTicklerDetail();
    }
    return derivedState.backAction;
  }, [closePersonDetail, closeTicklerDetail, derivedState.backAction]);

  return {
    ...derivedState,
    closeActiveDetail,
    closePersonDetail,
    closeTicklerDetail,
    openPersonDetail,
    openTicklerDetail,
    personDetailUid: selectionState.personDetailUid,
    resetDetailSelection,
    selectionState,
    ticklerDetailPageUid: selectionState.ticklerDetailPageUid,
  };
}
