import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { TicklerGroup, TodoItem } from "../types";
import { TEST_SETTINGS } from "./fixtures";

const workflowReviewStepSpy = vi.fn();
const reviewPageDetailPaneSpy = vi.fn();

vi.mock("../components/WorkflowReviewStep", () => ({
  WorkflowReviewStep: (props: { sections: Array<{ key: string; title?: React.ReactNode }> }) => {
    workflowReviewStepSpy(props);
    return React.createElement(
      "div",
      null,
      "workflow-review-step",
      props.sections.map((section) =>
        React.createElement("div", { key: section.key }, section.title ?? null),
      ),
    );
  },
}));

vi.mock("../components/ReviewPageDetailPane", () => ({
  ReviewPageDetailPane: (props: unknown) => {
    reviewPageDetailPaneSpy(props);
    return React.createElement("div", null, "review-page-detail");
  },
}));

import { TicklerStep } from "../components/TicklerStep";

function createTodo(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    ageDays: 0,
    createdTime: 0,
    deferredDate: null,
    pageTitle: "Tickler",
    text: "{{[[TODO]]}} Follow up",
    uid: "todo-1",
    ...overrides,
  };
}

function t(key: string): string {
  if (key === "actionActivate") {
    return "Activate";
  }
  if (key === "step7Title") {
    return "Tickler";
  }
  return key;
}

describe("TicklerStep", () => {
  it("maps tickler groups into workflow-review sections with clickable date headings", () => {
    workflowReviewStepSpy.mockClear();
    reviewPageDetailPaneSpy.mockClear();
    const groups: Array<TicklerGroup> = [
      {
        dailyPageUid: "page-1",
        dailyTitle: "March 10th, 2026",
        items: [createTodo()],
      },
    ];
    const onItemProcessed = vi.fn();
    const onOpenDetail = vi.fn();
    const onOpenInSidebar = vi.fn();
    const onPromoteToNext = vi.fn();

    const markup = renderToStaticMarkup(
      React.createElement(TicklerStep, {
        activeDetailPageUid: null,
        groups,
        onItemProcessed,
        onOpenDetail,
        onOpenInSidebar,
        onPromoteToNext,
        settings: TEST_SETTINGS,
        t,
      }),
    );

    expect(markup).toContain("workflow-review-step");
    expect(workflowReviewStepSpy).toHaveBeenCalledTimes(1);
    expect(workflowReviewStepSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        activeTriageUid: null,
        emptyStepTitle: "Tickler",
        onItemProcessed,
        onOpenInSidebar,
        onOpenTriage: expect.any(Function),
        sections: [
          expect.objectContaining({
            clockTargetTag: TEST_SETTINGS.tagSomeday,
            currentTag: "",
            hideCheckbox: true,
            items: groups[0]?.items,
            key: "March 10th, 2026",
            onPrimaryAction: onPromoteToNext,
            primaryActionLabel: "Activate",
            separatorColor: "#e4e4e7",
            title: expect.any(Object),
          }),
        ],
        settings: TEST_SETTINGS,
        t,
        useIncrementalRows: true,
      }),
    );
    expect(markup).toContain("March 10th, 2026");
    expect(markup).toContain("button");
    expect(onOpenDetail).not.toHaveBeenCalled();
    expect(reviewPageDetailPaneSpy).not.toHaveBeenCalled();
  });

  it("renders the shared detail pane when a tickler date detail is active", () => {
    workflowReviewStepSpy.mockClear();
    reviewPageDetailPaneSpy.mockClear();

    const markup = renderToStaticMarkup(
      React.createElement(TicklerStep, {
        activeDetailPageUid: "page-1",
        groups: [
          {
            dailyPageUid: "page-1",
            dailyTitle: "March 10th, 2026",
            items: [createTodo()],
          },
        ],
        onItemProcessed: vi.fn(),
        onOpenDetail: vi.fn(),
        onOpenInSidebar: vi.fn(),
        onPromoteToNext: vi.fn(),
        settings: TEST_SETTINGS,
        t,
      }),
    );

    expect(markup).toContain("review-page-detail");
    expect(reviewPageDetailPaneSpy).toHaveBeenCalledWith(
      expect.objectContaining({ pageUid: "page-1" }),
    );
    expect(workflowReviewStepSpy).not.toHaveBeenCalled();
  });
});
