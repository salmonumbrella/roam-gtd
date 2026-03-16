import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createWeeklyReviewRoamBlockHarness,
  type WeeklyReviewRoamBlockHarness,
} from "./helpers/weekly-review-roam-block-harness";

describe("WeeklyReviewRoamBlock behavior", () => {
  let harness: WeeklyReviewRoamBlockHarness | null = null;

  afterEach(() => {
    harness?.cleanup();
    harness = null;
  });

  it("keeps the placeholder visible through uid changes until content is ready in always mode", async () => {
    const onContentReady = vi.fn();
    harness = createWeeklyReviewRoamBlockHarness();
    const view = harness.renderBlock({
      loadingPlaceholderMode: "always",
      onContentReady,
      uid: "todo-1",
    });

    expect(view.container.querySelector(".gtd-skeleton")).not.toBeNull();
    expect(onContentReady).not.toHaveBeenCalled();

    await harness.publishReady("todo-1");

    expect(view.container.querySelector(".gtd-skeleton")).toBeNull();
    expect(view.container.textContent).toContain("todo-1");
    expect(onContentReady).toHaveBeenCalledTimes(1);

    view.rerender({
      loadingPlaceholderMode: "always",
      onContentReady,
      uid: "todo-2",
    });

    expect(view.container.querySelector(".gtd-skeleton")).not.toBeNull();
    expect(view.container.textContent).not.toContain("todo-1");
    expect(view.container.textContent).not.toContain("todo-2");
    expect(onContentReady).toHaveBeenCalledTimes(1);

    await harness.publishReady("todo-2");

    expect(view.container.querySelector(".gtd-skeleton")).toBeNull();
    expect(view.container.textContent).toContain("todo-2");
    expect(onContentReady).toHaveBeenCalledTimes(2);
  });

  it("ignores stale older-uid content that finishes after rerender", async () => {
    const onContentReady = vi.fn();
    harness = createWeeklyReviewRoamBlockHarness();
    const view = harness.renderBlock({
      loadingPlaceholderMode: "always",
      onContentReady,
      uid: "todo-1",
    });

    view.rerender({
      loadingPlaceholderMode: "always",
      onContentReady,
      uid: "todo-2",
    });

    expect(view.container.querySelector(".gtd-skeleton")).not.toBeNull();
    expect(onContentReady).not.toHaveBeenCalled();

    await harness.publishReady("todo-1");

    expect(view.container.querySelector(".gtd-skeleton")).not.toBeNull();
    expect(view.container.textContent).not.toContain("todo-1");
    expect(view.container.textContent).not.toContain("todo-2");
    expect(onContentReady).not.toHaveBeenCalled();

    await harness.publishReady("todo-2");

    expect(view.container.querySelector(".gtd-skeleton")).toBeNull();
    expect(view.container.textContent).toContain("todo-2");
    expect(onContentReady).toHaveBeenCalledTimes(1);
  });

  it("preserves prior content across uid changes in initial-only mode when preservePreviousContentOnUidChange is enabled", async () => {
    const onContentReady = vi.fn();
    harness = createWeeklyReviewRoamBlockHarness();
    const view = harness.renderBlock({
      loadingPlaceholderMode: "initial-only",
      onContentReady,
      preservePreviousContentOnUidChange: true,
      uid: "todo-1",
    });

    expect(view.container.querySelector(".gtd-skeleton")).not.toBeNull();
    expect(onContentReady).not.toHaveBeenCalled();

    await harness.publishReady("todo-1");

    expect(view.container.querySelector(".gtd-skeleton")).toBeNull();
    expect(view.container.textContent).toContain("todo-1");
    expect(onContentReady).toHaveBeenCalledTimes(1);

    view.rerender({
      loadingPlaceholderMode: "initial-only",
      onContentReady,
      preservePreviousContentOnUidChange: true,
      uid: "todo-2",
    });

    expect(view.container.querySelector(".gtd-skeleton")).toBeNull();
    expect(view.container.textContent).toContain("todo-1");
    expect(view.container.textContent).not.toContain("todo-2");
    expect(onContentReady).toHaveBeenCalledTimes(1);

    await harness.publishReady("todo-2");

    expect(view.container.querySelector(".gtd-skeleton")).toBeNull();
    expect(view.container.textContent).not.toContain("todo-1");
    expect(view.container.textContent).toContain("todo-2");
    expect(onContentReady).toHaveBeenCalledTimes(2);
  });

  it("does not surface stale content from an interrupted first render in preserve mode", async () => {
    const onContentReady = vi.fn();
    harness = createWeeklyReviewRoamBlockHarness();
    const view = harness.renderBlock({
      loadingPlaceholderMode: "initial-only",
      onContentReady,
      preservePreviousContentOnUidChange: true,
      uid: "todo-1",
    });

    expect(view.container.querySelector(".gtd-skeleton")).not.toBeNull();
    expect(onContentReady).not.toHaveBeenCalled();

    view.rerender({
      loadingPlaceholderMode: "initial-only",
      onContentReady,
      preservePreviousContentOnUidChange: true,
      uid: "todo-2",
    });

    expect(view.container.querySelector(".gtd-skeleton")).not.toBeNull();
    expect(view.container.textContent).not.toContain("todo-1");
    expect(view.container.textContent).not.toContain("todo-2");
    expect(onContentReady).not.toHaveBeenCalled();

    await harness.publishReady("todo-1");

    expect(view.container.querySelector(".gtd-skeleton")).not.toBeNull();
    expect(view.container.textContent).not.toContain("todo-1");
    expect(view.container.textContent).not.toContain("todo-2");
    expect(onContentReady).not.toHaveBeenCalled();

    await harness.publishReady("todo-2");

    expect(view.container.querySelector(".gtd-skeleton")).toBeNull();
    expect(view.container.textContent).not.toContain("todo-1");
    expect(view.container.textContent).toContain("todo-2");
    expect(onContentReady).toHaveBeenCalledTimes(1);
  });

  it("skips the placeholder in never mode but only reports readiness once the block content exists", async () => {
    const onContentReady = vi.fn();
    harness = createWeeklyReviewRoamBlockHarness();
    const view = harness.renderBlock({
      loadingPlaceholderMode: "never",
      onContentReady,
      uid: "todo-1",
    });

    expect(view.container.querySelector(".gtd-skeleton")).toBeNull();
    expect(view.container.textContent).not.toContain("todo-1");
    expect(onContentReady).not.toHaveBeenCalled();

    await harness.publishReady("todo-1");

    expect(view.container.querySelector(".gtd-skeleton")).toBeNull();
    expect(view.container.textContent).toContain("todo-1");
    expect(onContentReady).toHaveBeenCalledTimes(1);
  });
});
