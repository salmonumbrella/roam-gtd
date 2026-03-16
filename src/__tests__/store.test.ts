import { describe, expect, it, vi } from "vitest";

import { createGtdStore, settingsEqual } from "../store";
import { TEST_SETTINGS } from "./fixtures";

describe("createGtdStore", () => {
  it("returns expected store methods", () => {
    const store = createGtdStore();
    expect(typeof store.subscribe).toBe("function");
    expect(typeof store.getSnapshot).toBe("function");
    expect(typeof store.refresh).toBe("function");
    expect(typeof store.scheduleRefresh).toBe("function");
    expect(typeof store.dispose).toBe("function");
  });

  it("returns empty initial state", () => {
    const store = createGtdStore();
    const state = store.getSnapshot();
    expect(state.inbox).toEqual([]);
    expect(state.nextActions).toEqual([]);
    expect(state.waitingFor).toEqual([]);
    expect(state.delegated).toEqual([]);
    expect(state.someday).toEqual([]);
    expect(state.backHalfHydrated).toBe(false);
    expect(state.backHalfLoadedAt).toBeNull();
    expect(state.stale).toEqual([]);
    expect(state.deferred).toEqual([]);
    expect(state.projects).toEqual([]);
    expect(state.topGoals).toEqual([]);
    expect(state.ticklerItems).toEqual([]);
    expect(state.completedThisWeek).toEqual([]);
    expect(state.lastWeekMetrics).toBeNull();
    expect(state.loading).toBe(false);
  });

  it("calls subscriber immediately", () => {
    const store = createGtdStore();
    const subscriber = vi.fn<(state: ReturnType<typeof store.getSnapshot>) => void>();
    const unsubscribe = store.subscribe(subscriber);
    expect(subscriber).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe("settingsEqual", () => {
  const baseSettings = TEST_SETTINGS;

  it("returns true for two objects with identical values", () => {
    const a = { ...baseSettings };
    const b = { ...baseSettings };
    expect(a).not.toBe(b); // different references
    expect(settingsEqual(a, b)).toBe(true);
  });

  it("returns true for the same reference", () => {
    expect(settingsEqual(baseSettings, baseSettings)).toBe(true);
  });

  it("detects tagNextAction difference", () => {
    expect(settingsEqual(baseSettings, { ...baseSettings, tagNextAction: "next" })).toBe(false);
  });

  it("detects tagWaitingFor difference", () => {
    expect(settingsEqual(baseSettings, { ...baseSettings, tagWaitingFor: "wait" })).toBe(false);
  });

  it("detects tagDelegated difference", () => {
    expect(
      settingsEqual(baseSettings, {
        ...baseSettings,
        tagDelegated: "assigned",
      }),
    ).toBe(false);
  });

  it("detects tagSomeday difference", () => {
    expect(settingsEqual(baseSettings, { ...baseSettings, tagSomeday: "maybe" })).toBe(false);
  });

  it("detects inboxPage difference", () => {
    expect(settingsEqual(baseSettings, { ...baseSettings, inboxPage: "Inbox" })).toBe(false);
  });

  it("detects dailyPlanParent difference", () => {
    expect(settingsEqual(baseSettings, { ...baseSettings, dailyPlanParent: "[[Plan]]" })).toBe(
      false,
    );
  });

  it("detects dailyReviewNotify difference", () => {
    expect(settingsEqual(baseSettings, { ...baseSettings, dailyReviewNotify: false })).toBe(false);
  });

  it("detects dailyReviewStaleDays difference", () => {
    expect(settingsEqual(baseSettings, { ...baseSettings, dailyReviewStaleDays: 7 })).toBe(false);
  });

  it("detects staleDays difference", () => {
    expect(settingsEqual(baseSettings, { ...baseSettings, staleDays: 7 })).toBe(false);
  });

  it("detects topGoalAttr difference", () => {
    expect(settingsEqual(baseSettings, { ...baseSettings, topGoalAttr: "Goal" })).toBe(false);
  });

  it("detects reviewItemMode difference", () => {
    expect(
      settingsEqual(baseSettings, {
        ...baseSettings,
        reviewItemMode: "one-by-one",
      }),
    ).toBe(false);
  });

  it("detects locale difference", () => {
    expect(settingsEqual(baseSettings, { ...baseSettings, locale: "zh-TW" })).toBe(false);
  });

  it("detects agentDelegationWebhookUrl difference", () => {
    expect(
      settingsEqual(baseSettings, {
        ...baseSettings,
        agentDelegationWebhookUrl: "https://example.com/webhook",
      }),
    ).toBe(false);
  });

  it("detects triggerListPage difference", () => {
    expect(
      settingsEqual(baseSettings, {
        ...baseSettings,
        triggerListPage: "Triggers",
      }),
    ).toBe(false);
  });
});
