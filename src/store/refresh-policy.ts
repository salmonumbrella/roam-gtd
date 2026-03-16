import { toRoamLogId } from "../date-utils";
import { getSettingsComparisonSignature, type GtdSettings } from "../settings";
import type { TodoItem } from "../types";
import type { GtdState } from "./index";

export type RefreshScope = "backHalf" | "full" | "inboxOnly" | "live" | "projects" | "workflow";

export interface RefreshOptions {
  scope?: RefreshScope;
}

export interface QueuedRefreshRequest {
  scopeMask: number;
  settings: GtdSettings;
}

export const DEFAULT_REFRESH_DELAY_MS = 150;
export const REFRESH_SCOPE_BITS = {
  backHalf: 1 << 3,
  full: (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3),
  inboxOnly: 1 << 0,
  live: (1 << 0) | (1 << 1) | (1 << 4),
  projects: 1 << 2,
  workflow: 1 << 1,
} as const;
export const LIVE_REFRESH_FLAG_BIT = 1 << 4;

let todayLogIdCache: { key: string; value: number } | null = null;

function buildDateCacheKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function getCachedTodayLogId(now: number): number {
  const today = new Date(now);
  const cacheKey = buildDateCacheKey(today);
  if (todayLogIdCache?.key === cacheKey) {
    return todayLogIdCache.value;
  }
  const logId = toRoamLogId(today);
  todayLogIdCache = { key: cacheKey, value: logId };
  return logId;
}

export function settingsEqual(a: GtdSettings, b: GtdSettings): boolean {
  return getSettingsComparisonSignature(a) === getSettingsComparisonSignature(b);
}

export function todoItemsEqual(left: Array<TodoItem>, right: Array<TodoItem>): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftItem = left[index];
    const rightItem = right[index];
    if (
      leftItem?.ageDays !== rightItem?.ageDays ||
      leftItem?.deferredDate !== rightItem?.deferredDate ||
      leftItem?.createdTime !== rightItem?.createdTime ||
      leftItem?.pageTitle !== rightItem?.pageTitle ||
      leftItem?.text !== rightItem?.text ||
      leftItem?.uid !== rightItem?.uid
    ) {
      return false;
    }
  }
  return true;
}

export function isColdStartHydrationState(state: GtdState): boolean {
  return (
    !state.backHalfHydrated &&
    !state.projectsHydrated &&
    state.completedThisWeek.length === 0 &&
    state.deferred.length === 0 &&
    state.delegated.length === 0 &&
    state.inbox.length === 0 &&
    state.lastWeekMetrics === null &&
    state.nextActions.length === 0 &&
    state.projects.length === 0 &&
    state.someday.length === 0 &&
    state.stale.length === 0 &&
    state.ticklerItems.length === 0 &&
    state.topGoals.length === 0 &&
    state.waitingFor.length === 0
  );
}

export interface RefreshExecutionFlags {
  includeBackHalf: boolean;
  includeInbox: boolean;
  includeProjects: boolean;
  includeWorkflow: boolean;
  isLiveRefresh: boolean;
  shouldBatchSecondaryHydration: boolean;
  shouldToggleLoading: boolean;
}

export function deriveRefreshExecutionFlags(
  scopeMask: number,
  state: GtdState,
): RefreshExecutionFlags {
  const includeInbox = (scopeMask & REFRESH_SCOPE_BITS.inboxOnly) !== 0;
  const includeWorkflow = (scopeMask & REFRESH_SCOPE_BITS.workflow) !== 0;
  const includeProjects = (scopeMask & REFRESH_SCOPE_BITS.projects) !== 0;
  const includeBackHalf = (scopeMask & REFRESH_SCOPE_BITS.backHalf) !== 0;
  const isLiveRefresh = (scopeMask & LIVE_REFRESH_FLAG_BIT) !== 0;

  return {
    includeBackHalf,
    includeInbox,
    includeProjects,
    includeWorkflow,
    isLiveRefresh,
    shouldBatchSecondaryHydration:
      includeInbox &&
      includeWorkflow &&
      includeProjects &&
      includeBackHalf &&
      isColdStartHydrationState(state),
    shouldToggleLoading: includeInbox,
  };
}

export function getScopeMask(options?: RefreshOptions): number {
  const scope = options?.scope ?? "full";
  return REFRESH_SCOPE_BITS[scope];
}

export function mergeRefreshRequests(
  current: QueuedRefreshRequest | null,
  next: QueuedRefreshRequest,
): QueuedRefreshRequest {
  if (current === null) {
    return next;
  }
  if (!settingsEqual(current.settings, next.settings)) {
    return next;
  }
  return {
    scopeMask: current.scopeMask | next.scopeMask,
    settings: next.settings,
  };
}

export function didWorkflowItemsChange(
  state: Pick<GtdState, "delegated" | "nextActions" | "someday" | "waitingFor">,
  nextGroups: Pick<GtdState, "delegated" | "nextActions" | "someday" | "waitingFor">,
): boolean {
  return (
    nextGroups.delegated !== state.delegated ||
    nextGroups.nextActions !== state.nextActions ||
    nextGroups.someday !== state.someday ||
    nextGroups.waitingFor !== state.waitingFor
  );
}

function shouldLogTimings(): boolean {
  const timingWindow = globalThis.window as
    | (Window & { __ROAM_GTD_DEBUG_TIMINGS?: boolean })
    | undefined;
  return timingWindow?.__ROAM_GTD_DEBUG_TIMINGS === true;
}

export function logRefreshTiming(
  label: string,
  startedAt: number,
  metadata: Record<string, number | string> = {},
): void {
  if (!shouldLogTimings()) {
    return;
  }
  // eslint-disable-next-line no-console -- opt-in debug timings for refresh profiling
  console.debug("[RoamGTD][timing]", {
    durationMs: Math.max(0, Date.now() - startedAt),
    label,
    ...metadata,
  });
}
