import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ReviewWizardHeader,
  ReviewWizardProgressBar,
} from "../components/review-wizard/ReviewWizardHeader";

describe("ReviewWizardHeader", () => {
  it("renders the title, progress bar, and optional fast-forward control", () => {
    const headerMarkup = renderToStaticMarkup(
      React.createElement(ReviewWizardHeader, {
        fastForwardLabel: "Next Step",
        onFastForward: () => undefined,
        onFastForwardMouseDown: () => undefined,
        showFastForwardButton: true,
        title: "Projects",
      }),
    );
    const progressMarkup = renderToStaticMarkup(
      React.createElement(ReviewWizardProgressBar, {
        progressValue: 0.5,
      }),
    );

    expect(headerMarkup).toContain("Projects");
    expect(headerMarkup).toContain("roam-gtd-step-fast-forward-button");
    expect(progressMarkup).toContain("roam-gtd-progress-wrapper");
  });
});
