import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PersonEntry } from "../people";
import { TEST_SETTINGS } from "./fixtures";

const workflowReviewStepSpy = vi.fn();
const reviewPageDetailPaneSpy = vi.fn();

vi.mock("../components/WorkflowReviewStep", () => ({
  WorkflowReviewStep: (props: unknown) => {
    workflowReviewStepSpy(props);
    return React.createElement("div", null, "workflow-review-step");
  },
}));

vi.mock("../components/ReviewPageDetailPane", () => ({
  ReviewPageDetailPane: (props: unknown) => {
    reviewPageDetailPaneSpy(props);
    return React.createElement("div", null, "review-page-detail-pane");
  },
}));

import { WaitingForStep } from "../components/WaitingForStep";

function t(key: string): string {
  return key;
}

describe("WaitingForStep", () => {
  it("uses the shared detail pane when a delegated person detail is open", () => {
    workflowReviewStepSpy.mockClear();
    reviewPageDetailPaneSpy.mockClear();

    const activePersonDetail: PersonEntry = {
      title: "Alice",
      uid: "person-1",
    };

    const markup = renderToStaticMarkup(
      React.createElement(WaitingForStep, {
        activePersonDetail,
        activeTriageUid: null,
        delegatedChildPersonRefs: new Map<string, Array<string>>(),
        delegatedItems: [],
        delegatedPeople: [],
        onItemProcessed: vi.fn(),
        onOpenPersonDetail: vi.fn(),
        onOpenTriage: vi.fn(),
        settings: TEST_SETTINGS,
        t,
        waitingItems: [],
      }),
    );

    expect(markup).toContain("review-page-detail-pane");
    expect(reviewPageDetailPaneSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pageUid: "person-1",
      }),
    );
  });
});
