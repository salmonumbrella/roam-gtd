import type { GtdSettings } from "../settings";
import type { ProjectSummary, TicklerGroup, TodoItem, TopGoalEntry, WeeklyMetrics } from "../types";
import { runStoreRefresh } from "./hydration";
import { buildTicklerGroups } from "./query-mappers";
import {
  DEFAULT_REFRESH_DELAY_MS,
  getScopeMask,
  mergeRefreshRequests,
  settingsEqual,
  type QueuedRefreshRequest,
  type RefreshOptions,
  type RefreshScope,
} from "./refresh-policy";

export { buildTicklerGroups, settingsEqual };
export type { RefreshOptions, RefreshScope };

export interface GtdState {
  backHalfHydrated: boolean;
  backHalfLoadedAt?: number | null;
  completedThisWeek: Array<TodoItem>;
  deferred: Array<TodoItem>;
  delegated: Array<TodoItem>;
  inbox: Array<TodoItem>;
  lastWeekMetrics: WeeklyMetrics | null;
  loading: boolean;
  nextActions: Array<TodoItem>;
  projects: Array<ProjectSummary>;
  projectsHydrated: boolean;
  projectsLoadedAt?: number | null;
  projectsLoading: boolean;
  someday: Array<TodoItem>;
  stale: Array<TodoItem>;
  ticklerItems: Array<TicklerGroup>;
  topGoals: Array<TopGoalEntry>;
  triagedThisWeekCount: number;
  waitingFor: Array<TodoItem>;
  workflowHydrated: boolean;
}

const EMPTY_STATE: GtdState = {
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
  projectsLoadedAt: null,
  projectsLoading: false,
  someday: [],
  stale: [],
  ticklerItems: [],
  topGoals: [],
  triagedThisWeekCount: 0,
  waitingFor: [],
  workflowHydrated: false,
};

type Subscriber = (state: GtdState) => void;

export function createGtdStore() {
  let state: GtdState = { ...EMPTY_STATE };
  const subscribers = new Set<Subscriber>();
  let pendingRefreshRequest: QueuedRefreshRequest | null = null;
  let latestRefreshRequest: QueuedRefreshRequest | null = null;
  let scheduledRefreshRequest: QueuedRefreshRequest | null = null;
  let refreshLoop: Promise<void> | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  const notify = (): void => {
    for (const subscriber of subscribers) {
      try {
        subscriber(state);
      } catch {
        // subscriber errors are swallowed
      }
    }
  };

  const subscribe = (subscriber: Subscriber): (() => void) => {
    subscribers.add(subscriber);
    subscriber(state);
    return () => {
      subscribers.delete(subscriber);
    };
  };

  const getSnapshot = (): GtdState => state;

  const setState = (nextState: GtdState): void => {
    state = nextState;
  };

  const clearRefreshTimer = (): void => {
    if (refreshTimer !== null) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  };

  const runRefreshLoop = (): Promise<void> => {
    if (refreshLoop !== null) {
      return refreshLoop;
    }

    refreshLoop = (async () => {
      while (pendingRefreshRequest !== null) {
        const request = pendingRefreshRequest;
        pendingRefreshRequest = null;
        if (!request) {
          continue;
        }
        const preRunLatest = latestRefreshRequest;
        await runStoreRefresh({
          getState: () => state,
          notify,
          scopeMask: request.scopeMask,
          setState,
          settings: request.settings,
        });

        if (
          pendingRefreshRequest === null &&
          latestRefreshRequest !== null &&
          latestRefreshRequest !== preRunLatest
        ) {
          pendingRefreshRequest = latestRefreshRequest;
        }
      }
    })().finally(() => {
      refreshLoop = null;
    });

    return refreshLoop;
  };

  const queueRefreshRequest = (request: QueuedRefreshRequest): Promise<void> => {
    latestRefreshRequest = mergeRefreshRequests(latestRefreshRequest, request);
    pendingRefreshRequest = mergeRefreshRequests(pendingRefreshRequest, request);
    return runRefreshLoop();
  };

  const queueRefresh = (settings: GtdSettings, options?: RefreshOptions): Promise<void> => {
    return queueRefreshRequest({ scopeMask: getScopeMask(options), settings });
  };

  const refresh = (settings: GtdSettings, options?: RefreshOptions): Promise<void> => {
    clearRefreshTimer();
    scheduledRefreshRequest = null;
    return queueRefresh(settings, options);
  };

  const scheduleRefresh = (
    settings: GtdSettings,
    delayMs = DEFAULT_REFRESH_DELAY_MS,
    options?: RefreshOptions,
  ): void => {
    const nextRequest = { scopeMask: getScopeMask(options), settings };
    scheduledRefreshRequest = mergeRefreshRequests(scheduledRefreshRequest, nextRequest);
    clearRefreshTimer();

    const delay = Math.max(0, delayMs);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      if (scheduledRefreshRequest === null) {
        return;
      }

      const queuedRequest = scheduledRefreshRequest;
      scheduledRefreshRequest = null;
      void queueRefreshRequest(queuedRequest);
    }, delay);
  };

  const dispose = (): void => {
    clearRefreshTimer();
    scheduledRefreshRequest = null;
    pendingRefreshRequest = null;
    latestRefreshRequest = null;
    subscribers.clear();
  };

  return {
    dispose,
    getSnapshot,
    refresh,
    scheduleRefresh,
    subscribe,
  };
}
