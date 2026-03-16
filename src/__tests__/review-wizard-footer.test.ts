import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReviewWizardFooter } from "../components/review-wizard/ReviewWizardFooter";

describe("ReviewWizardFooter", () => {
  it("renders the footer shell actions and legend segments", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ReviewWizardFooter, {
        labels: {
          back: "Back",
          finish: "Finish",
          next: "Next",
          nextItem: "Next",
          nextStep: "Next Step",
          previousItem: "Previous Item",
          saveWeeklySummary: "Save Weekly Summary",
          summarySaved: "Summary Saved",
        },
        leftAction: {
          action: "back",
          intent: "default",
          kind: "button",
          labelKey: "back",
        },
        legendSegments: [
          { color: "#a6e3a1", text: "u" },
          { color: "#A5A5A5", text: " up" },
        ],
        onAction: () => undefined,
        rightAction: {
          action: "forward",
          intent: "primary",
          kind: "button",
          labelKey: "nextStep",
        },
      }),
    );

    expect(markup).toContain("Back");
    expect(markup).toContain("Next Step");
    expect(markup).toContain("roam-gtd-hotkey-legend");
  });
});
