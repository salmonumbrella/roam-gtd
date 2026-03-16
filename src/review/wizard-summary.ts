import { useCallback, useState } from "react";

import { formatRoamDate, getISOWeekNumber, getMondayOfWeek } from "../date-utils";
import type { GtdState } from "../store";
import { computeAvgTime } from "../store/dashboard-derived";
import { findPageUid } from "./wizard-runtime";

interface UseReviewWizardSummaryArgs {
  state: GtdState;
}

interface WeeklyReviewSummaryPayload {
  children: Array<string>;
  goalRefs: Array<string>;
  headerText: string;
}

interface WriteWeeklyReviewSummaryArgs {
  findSummaryPageUid?: (title: string) => string | null;
  now?: Date;
  state: GtdState;
}

function getRoamSummaryApi() {
  return {
    createBlock: window.roamAlphaAPI.createBlock,
    createPage: window.roamAlphaAPI.createPage,
    generateUid: window.roamAlphaAPI.util.generateUID,
  };
}

export function buildWeeklyReviewSummaryPayload(
  state: GtdState,
  now = new Date(),
): WeeklyReviewSummaryPayload {
  const monday = getMondayOfWeek(now);
  const weekNum = getISOWeekNumber(monday);
  const mondayTitle = formatRoamDate(monday);
  const headerText = `[Week ${weekNum}]([[${mondayTitle}]])`;
  const avgTime = computeAvgTime(state.completedThisWeek);
  const children = [
    `Completed:: ${state.completedThisWeek.length}`,
    `Open Next Actions:: ${state.nextActions.length}`,
    `Waiting For:: ${state.waitingFor.length}`,
    `Delegated:: ${state.delegated.length}`,
    `Someday:: ${state.someday.length}`,
    `Active Projects:: ${state.projects.length}`,
    `Stale Items:: ${state.stale.length}`,
  ];

  if (avgTime != null) {
    children.splice(1, 0, `Avg Time:: ${Number(avgTime.toFixed(2))}`);
  }

  if (state.topGoals.length > 0) {
    children.push("Top Goals::");
  }

  return {
    children,
    goalRefs: state.topGoals.slice(0, 5).map((goal) => `((${goal.uid}))`),
    headerText,
  };
}

export async function writeWeeklyReviewSummary({
  findSummaryPageUid = findPageUid,
  now = new Date(),
  state,
}: WriteWeeklyReviewSummaryArgs): Promise<void> {
  const api = getRoamSummaryApi();
  const payload = buildWeeklyReviewSummaryPayload(state, now);
  const generatedUid = api.generateUid();

  try {
    await api.createPage({
      page: { title: "Weekly Reviews", uid: generatedUid },
    });
  } catch {
    // Page may already exist.
  }

  const parentUid = findSummaryPageUid("Weekly Reviews") ?? generatedUid;
  const headerUid = api.generateUid();

  await api.createBlock({
    block: { string: payload.headerText, uid: headerUid },
    location: { order: 0, "parent-uid": parentUid },
  });

  for (const child of payload.children) {
    await api.createBlock({
      block: { string: child },
      location: { order: "last", "parent-uid": headerUid },
    });
  }

  for (const goalRef of payload.goalRefs) {
    await api.createBlock({
      block: { string: goalRef },
      location: { order: "last", "parent-uid": headerUid },
    });
  }
}

export function useReviewWizardSummary({ state }: UseReviewWizardSummaryArgs) {
  const [savedSummary, setSavedSummary] = useState(false);

  const resetSummaryState = useCallback(() => {
    setSavedSummary(false);
  }, []);

  const saveReviewSummary = useCallback(async () => {
    await writeWeeklyReviewSummary({ state });
    setSavedSummary(true);
  }, [state]);

  return {
    resetSummaryState,
    savedSummary,
    saveReviewSummary,
  };
}
