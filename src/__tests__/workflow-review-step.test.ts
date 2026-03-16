import { describe, expect, it } from "vitest";

import { getWorkflowReviewVisibleRowCount } from "../components/WorkflowReviewStep";

describe("getWorkflowReviewVisibleRowCount", () => {
  it("increments the mounted row count in batches and clamps at the total", () => {
    expect(getWorkflowReviewVisibleRowCount(40, 100, 30)).toBe(70);
    expect(getWorkflowReviewVisibleRowCount(70, 80, 30)).toBe(80);
    expect(getWorkflowReviewVisibleRowCount(0, 0, 30)).toBe(0);
  });
});
