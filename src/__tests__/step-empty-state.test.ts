import { describe, expect, it } from "vitest";

import { getStepEmptyStateProps } from "../components/StepEmptyState";

describe("getStepEmptyStateProps", () => {
  it("returns complete variant props", () => {
    const result = getStepEmptyStateProps({
      subtitle: "3 of 3 reviewed",
      title: "All projects reviewed",
      variant: "complete",
    });
    expect(result.icon).toBe("tick-circle");
    expect(result.iconColor).toBe("#466B46");
    expect(result.title).toBe("All projects reviewed");
    expect(result.subtitle).toBe("3 of 3 reviewed");
  });

  it("returns empty variant props with custom icon", () => {
    const result = getStepEmptyStateProps({
      icon: "projects",
      title: "No active projects",
      variant: "empty",
    });
    expect(result.icon).toBe("projects");
    expect(result.iconColor).toBeUndefined();
    expect(result.title).toBe("No active projects");
    expect(result.subtitle).toBeUndefined();
  });

  it("defaults empty icon to inbox when not provided", () => {
    const result = getStepEmptyStateProps({
      title: "Nothing here",
      variant: "empty",
    });
    expect(result.icon).toBe("inbox");
  });
});
