import { describe, expect, it } from "vitest";

import {
  deriveRefreshExecutionFlags,
  getScopeMask,
  mergeRefreshRequests,
  settingsEqual,
  todoItemsEqual,
  type QueuedRefreshRequest,
} from "../store/refresh-policy";
import { TEST_SETTINGS } from "./fixtures";

describe("store refresh policy", () => {
  it("merges scope masks when settings are unchanged", () => {
    const current: QueuedRefreshRequest = {
      scopeMask: getScopeMask({ scope: "inboxOnly" }),
      settings: TEST_SETTINGS,
    };
    const next: QueuedRefreshRequest = {
      scopeMask: getScopeMask({ scope: "workflow" }),
      settings: { ...TEST_SETTINGS },
    };

    expect(mergeRefreshRequests(current, next)).toEqual({
      scopeMask: getScopeMask({ scope: "inboxOnly" }) | getScopeMask({ scope: "workflow" }),
      settings: next.settings,
    });
  });

  it("replaces the queued request when settings change", () => {
    const current: QueuedRefreshRequest = {
      scopeMask: getScopeMask({ scope: "full" }),
      settings: TEST_SETTINGS,
    };
    const next: QueuedRefreshRequest = {
      scopeMask: getScopeMask({ scope: "projects" }),
      settings: { ...TEST_SETTINGS, staleDays: TEST_SETTINGS.staleDays + 1 },
    };

    expect(mergeRefreshRequests(current, next)).toBe(next);
  });

  it("compares todo arrays structurally", () => {
    const left = [
      {
        ageDays: 1,
        createdTime: 100,
        deferredDate: null,
        pageTitle: "Page",
        text: "A",
        uid: "a",
      },
    ];
    const right = [
      {
        ageDays: 1,
        createdTime: 100,
        deferredDate: null,
        pageTitle: "Page",
        text: "A",
        uid: "a",
      },
    ];

    expect(todoItemsEqual(left, right)).toBe(true);
    expect(todoItemsEqual(left, [{ ...right[0], text: "B" }])).toBe(false);
  });

  it("derives refresh execution flags from scope and cold-start state", () => {
    const flags = deriveRefreshExecutionFlags(getScopeMask({ scope: "full" }), {
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
    });

    expect(flags).toEqual({
      includeBackHalf: true,
      includeInbox: true,
      includeProjects: true,
      includeWorkflow: true,
      isLiveRefresh: false,
      shouldBatchSecondaryHydration: true,
      shouldToggleLoading: true,
    });
  });

  it("keeps settings comparison in the policy module", () => {
    expect(settingsEqual(TEST_SETTINGS, { ...TEST_SETTINGS })).toBe(true);
    expect(settingsEqual(TEST_SETTINGS, { ...TEST_SETTINGS, staleDays: 999 })).toBe(false);
  });
});
