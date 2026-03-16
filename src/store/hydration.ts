import { executeQuery, pullEntities, runRoamQuery } from "../data";
import { formatRoamDate, getISOWeekBounds, getMonthLogIdRange } from "../date-utils";
import {
  buildActiveProjectEntityIdsQuery,
  buildCompletedThisWeekQuery,
  buildDeferredByTagsQuery,
  buildStaleQuery,
  buildTicklerScheduledItemsQuery,
  buildTicklerScheduledPageRefsQuery,
  buildTodosByTagsQuery,
  buildTopGoalsQuery,
  buildTriageBlockEntityIdsQuery,
  buildTriagedThisWeekQuery,
} from "../queries";
import type { GtdSettings } from "../settings";
import type { WeeklyMetrics } from "../types";
import type { GtdState } from "./index";
import {
  buildTicklerGroups,
  categorizeWorkflowTodoRows,
  mapCompletedTodoRows,
  mapDeferredTodoRows,
  mapPulledInboxItems,
  mapPulledProjects,
  mapTodoRows,
  mapTopGoalRows,
} from "./query-mappers";
import type { PulledProjectEntity, PulledTriageBlock } from "./query-mappers";
import {
  deriveRefreshExecutionFlags,
  didWorkflowItemsChange,
  getCachedTodayLogId,
  logRefreshTiming,
  todoItemsEqual,
} from "./refresh-policy";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface RunStoreRefreshArgs {
  getState: () => GtdState;
  notify: () => void;
  scopeMask: number;
  setState: (nextState: GtdState) => void;
  settings: GtdSettings;
}

function setAndRememberState(
  nextState: GtdState,
  setState: (nextState: GtdState) => void,
): GtdState {
  setState(nextState);
  return nextState;
}

function loadLastWeekMetrics(): WeeklyMetrics | null {
  try {
    const reviewPageRows = runRoamQuery(
      `[:find ?uid :where [?p :node/title "Weekly Reviews"] [?p :block/uid ?uid]]`,
    );
    const reviewPageUid = reviewPageRows?.[0]?.[0];
    if (typeof reviewPageUid !== "string") {
      return null;
    }

    const childRows = runRoamQuery(
      `[:find ?child-uid ?child-str ?order
        :in $ ?parent-uid
        :where
          [?parent :block/uid ?parent-uid]
          [?parent :block/children ?child]
          [?child :block/uid ?child-uid]
          [?child :block/string ?child-str]
          [?child :block/order ?order]]`,
      reviewPageUid,
    );
    if (!(childRows && childRows.length > 0)) {
      return null;
    }

    const sorted = [...childRows].sort((a, b) => (a[2] as number) - (b[2] as number));
    const firstEntryUid = sorted[0]?.[0];
    if (typeof firstEntryUid !== "string") {
      return null;
    }

    const metricRows = runRoamQuery(
      `[:find ?str :in $ ?parent-uid :where
        [?parent :block/uid ?parent-uid]
        [?parent :block/children ?child]
        [?child :block/string ?str]]`,
      firstEntryUid,
    );
    const metrics: Record<string, number> = {};
    for (const row of metricRows ?? []) {
      const str = row[0] as string;
      const match = str.match(/^(.+?)::\s*(\d+(?:\.\d+)?)/);
      if (match) {
        metrics[match[1].trim()] = Number(match[2]);
      }
    }
    if (Object.keys(metrics).length === 0) {
      return null;
    }

    return {
      avgTime: metrics["Avg Time"] ?? null,
      completed: metrics["Completed"] ?? 0,
      delegated: metrics["Delegated"] ?? 0,
      nextActions: metrics["Open Next Actions"] ?? 0,
      projects: metrics["Active Projects"] ?? 0,
      someday: metrics["Someday"] ?? 0,
      stale: metrics["Stale Items"] ?? 0,
      waitingFor: metrics["Waiting For"] ?? 0,
    };
  } catch {
    return null;
  }
}

export async function runStoreRefresh({
  getState,
  notify,
  scopeMask,
  setState,
  settings,
}: RunStoreRefreshArgs): Promise<void> {
  let state = getState();
  const refreshStartedAt = Date.now();
  const {
    includeBackHalf,
    includeInbox,
    includeProjects,
    includeWorkflow,
    shouldBatchSecondaryHydration,
    shouldToggleLoading,
  } = deriveRefreshExecutionFlags(scopeMask, state);
  if (shouldToggleLoading) {
    state = setAndRememberState({ ...state, loading: true }, setState);
    notify();
  }

  const workflowTags = [
    settings.tagNextAction,
    settings.tagWaitingFor,
    settings.tagDelegated,
    settings.tagSomeday,
  ];
  let inbox = state.inbox;
  let nextActions = state.nextActions;
  let waitingFor = state.waitingFor;
  let delegated = state.delegated;
  let someday = state.someday;
  let stale = state.stale;
  let deferred = state.deferred;
  let projects = state.projects;
  const shouldShowProjectsLoading = includeProjects && !state.projectsHydrated;
  let topGoals = state.topGoals;
  let completedThisWeek = state.completedThisWeek;
  let ticklerItems = state.ticklerItems;

  try {
    if (includeInbox) {
      const inboxRefreshStartedAt = Date.now();
      const entityIdRows = await executeQuery(buildTriageBlockEntityIdsQuery(settings.inboxPage));
      const entityIds = entityIdRows.map((row) => row[0] as number);

      const pullPattern = `[:block/uid :block/string :create/time {:block/refs [:node/title]} {:block/page [:node/title]} {:block/children [:block/uid :block/string :create/time {:block/refs [:node/title]} {:block/page [:node/title]}]}]`;
      const pulledBlocks = pullEntities<PulledTriageBlock>(pullPattern, entityIds);

      inbox = mapPulledInboxItems(pulledBlocks, workflowTags);
      state = setAndRememberState({ ...state, inbox, loading: false }, setState);
      notify();
      logRefreshTiming("refresh:inbox", inboxRefreshStartedAt, {
        inboxCount: inbox.length,
        scopeMask,
      });
    }

    if (includeWorkflow || includeProjects || includeBackHalf) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }

    if (includeWorkflow) {
      const workflowRefreshStartedAt = Date.now();
      const taggedTodoRows = await executeQuery(buildTodosByTagsQuery(workflowTags));
      const workflowGroups = categorizeWorkflowTodoRows(taggedTodoRows, settings);
      nextActions = workflowGroups.nextActions;
      waitingFor = workflowGroups.waitingFor;
      delegated = workflowGroups.delegated;
      someday = workflowGroups.someday;
      nextActions = todoItemsEqual(state.nextActions, nextActions)
        ? state.nextActions
        : nextActions;
      waitingFor = todoItemsEqual(state.waitingFor, waitingFor) ? state.waitingFor : waitingFor;
      delegated = todoItemsEqual(state.delegated, delegated) ? state.delegated : delegated;
      someday = todoItemsEqual(state.someday, someday) ? state.someday : someday;
      const wasWorkflowHydrated = state.workflowHydrated;
      const didWorkflowStateChange = didWorkflowItemsChange(state, {
        delegated,
        nextActions,
        someday,
        waitingFor,
      });
      state = setAndRememberState(
        {
          ...state,
          delegated,
          nextActions,
          someday,
          waitingFor,
          workflowHydrated: true,
        },
        setState,
      );
      if ((didWorkflowStateChange || !wasWorkflowHydrated) && !shouldBatchSecondaryHydration) {
        notify();
      }
      logRefreshTiming("refresh:workflow", workflowRefreshStartedAt, {
        delegatedCount: delegated.length,
        nextActionsCount: nextActions.length,
        scopeMask,
        somedayCount: someday.length,
        waitingForCount: waitingFor.length,
      });
    }

    if (includeProjects) {
      const projectsRefreshStartedAt = Date.now();
      // eslint-disable-next-line no-console -- temporary perf instrumentation
      console.log("[GTD-PROJECTS] hydration started at", performance.now().toFixed(1));
      if (shouldShowProjectsLoading) {
        state = setAndRememberState({ ...state, projectsLoading: true }, setState);
      }

      const q1Start = performance.now();
      const entityIdRows = await executeQuery(buildActiveProjectEntityIdsQuery());
      const entityIds = entityIdRows.map((row) => row[0] as number);
      const q1End = performance.now();
      // eslint-disable-next-line no-console -- temporary perf instrumentation
      console.log(
        `[GTD-PROJECTS] find query done: ${(q1End - q1Start).toFixed(1)}ms (${entityIds.length} entities)`,
      );

      const pullStart = performance.now();
      const pullPattern = `[:block/string :block/uid {:block/children [:block/string :block/uid :create/time :edit/time {:block/refs [:node/title]} {:block/children [:block/string :block/uid :create/time :edit/time {:block/refs [:node/title]}]}]}]`;
      const pulledEntities = pullEntities<PulledProjectEntity>(pullPattern, entityIds);
      // eslint-disable-next-line no-console -- temporary perf instrumentation
      console.log(
        `[GTD-PROJECTS] pull_many done: ${(performance.now() - pullStart).toFixed(1)}ms (${pulledEntities.length} entities)`,
      );

      const mapStart = performance.now();
      projects = mapPulledProjects(pulledEntities, {
        tagDelegated: settings.tagDelegated,
        tagNextAction: settings.tagNextAction,
        tagSomeday: settings.tagSomeday,
        tagWaitingFor: settings.tagWaitingFor,
      });
      // eslint-disable-next-line no-console -- temporary perf instrumentation
      console.log(
        `[GTD-PROJECTS] mapping done: ${(performance.now() - mapStart).toFixed(1)}ms (${projects.length} projects)`,
      );

      state = setAndRememberState(
        {
          ...state,
          projects,
          projectsHydrated: true,
          projectsLoadedAt: Date.now(),
          projectsLoading: false,
        },
        setState,
      );
      if (!shouldBatchSecondaryHydration) {
        notify();
      }
      // eslint-disable-next-line no-console -- temporary perf instrumentation
      console.log(`[GTD-PROJECTS] total hydration: ${(performance.now() - q1Start).toFixed(1)}ms`);
      logRefreshTiming("refresh:projects", projectsRefreshStartedAt, {
        projectCount: projects.length,
        scopeMask,
      });
    }

    if (includeBackHalf) {
      const backHalfRefreshStartedAt = Date.now();
      const now = Date.now();
      const currentDate = new Date(now);
      const shouldLoadTickler = currentDate.getDate() <= 7;
      const monthNameLower =
        formatRoamDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1))
          .split(" ", 1)[0]
          ?.toLowerCase() ?? "";
      const yearFragment = String(currentDate.getFullYear());
      const staleCutoff = now - settings.staleDays * MS_PER_DAY;
      const todayLogId = getCachedTodayLogId(now);
      const { end: weekEnd, start: weekStart } = getISOWeekBounds(currentDate);
      const { end: monthEnd, start: monthStart } = getMonthLogIdRange(currentDate);
      const [
        staleRows,
        taggedDeferredRows,
        topGoalRows,
        completedRows,
        triagedRows,
        ticklerScheduledPageRefRows,
        ticklerScheduledRows,
      ] = await Promise.all([
        executeQuery(buildStaleQuery(staleCutoff, todayLogId)),
        executeQuery(
          buildDeferredByTagsQuery([
            settings.tagNextAction,
            settings.tagWaitingFor,
            settings.tagDelegated,
          ]),
        ),
        executeQuery(buildTopGoalsQuery(settings.topGoalAttr)),
        executeQuery(buildCompletedThisWeekQuery(weekStart.getTime(), weekEnd.getTime())),
        executeQuery(
          buildTriagedThisWeekQuery(
            settings.inboxPage,
            [
              settings.tagNextAction,
              settings.tagWaitingFor,
              settings.tagDelegated,
              settings.tagSomeday,
            ],
            weekStart.getTime(),
          ),
        ),
        shouldLoadTickler
          ? executeQuery(
              buildTicklerScheduledPageRefsQuery(
                monthStart,
                monthEnd,
                settings.tagNextAction,
                settings.tagWaitingFor,
                settings.tagDelegated,
              ),
            )
          : Promise.resolve([]),
        shouldLoadTickler
          ? executeQuery(
              buildTicklerScheduledItemsQuery(
                monthNameLower,
                yearFragment,
                settings.tagNextAction,
                settings.tagWaitingFor,
                settings.tagDelegated,
              ),
            )
          : Promise.resolve([]),
      ]);

      stale = mapTodoRows(staleRows);
      deferred = mapDeferredTodoRows(taggedDeferredRows, settings);
      topGoals = mapTopGoalRows(topGoalRows, settings.topGoalAttr);
      completedThisWeek = mapCompletedTodoRows(completedRows);
      const triagedThisWeekCount = triagedRows.length;

      ticklerItems = shouldLoadTickler
        ? buildTicklerGroups({
            monthEndLogId: monthEnd,
            monthStartLogId: monthStart,
            scheduledPageRefRows: ticklerScheduledPageRefRows,
            scheduledRows: ticklerScheduledRows,
          })
        : [];

      const lastWeekMetrics = loadLastWeekMetrics();

      state = setAndRememberState(
        {
          ...state,
          backHalfHydrated: true,
          backHalfLoadedAt: now,
          completedThisWeek,
          deferred,
          lastWeekMetrics,
          stale,
          ticklerItems,
          topGoals,
          triagedThisWeekCount,
        },
        setState,
      );
      if (!shouldBatchSecondaryHydration) {
        notify();
      }
      logRefreshTiming("refresh:backHalf", backHalfRefreshStartedAt, {
        completedCount: completedThisWeek.length,
        deferredCount: deferred.length,
        scopeMask,
        staleCount: stale.length,
      });
    }
  } catch (error) {
    // eslint-disable-next-line no-console -- surface query failures for debugging
    console.warn("[RoamGTD] Store refresh failed:", error);
    if (shouldToggleLoading || (shouldShowProjectsLoading && state.projectsLoading)) {
      state = setAndRememberState(
        {
          ...state,
          loading: shouldToggleLoading ? false : state.loading,
          projectsLoading:
            shouldShowProjectsLoading && state.projectsLoading ? false : state.projectsLoading,
        },
        setState,
      );
    }
    notify();
    return;
  }

  if (shouldBatchSecondaryHydration) {
    notify();
  }

  logRefreshTiming("refresh:total", refreshStartedAt, { scopeMask });

  if (shouldToggleLoading && state.loading) {
    state = setAndRememberState({ ...state, loading: false }, setState);
    notify();
  }
}
