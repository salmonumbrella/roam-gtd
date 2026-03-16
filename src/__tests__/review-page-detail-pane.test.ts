import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const nativeBlockSpy = vi.fn();

vi.mock("../components/WeeklyReviewNativeBlock", () => ({
  WeeklyReviewNativeBlock: (props: unknown) => {
    nativeBlockSpy(props);
    return React.createElement("div", { "data-testid": "native-page-block" }, "native-page-block");
  },
}));

import { ReviewPageBlock } from "../components/ReviewPageBlock";
import { ReviewPageDetailPane } from "../components/ReviewPageDetailPane";

describe("ReviewPageDetailPane", () => {
  it("renders the shared review page block for a page uid", () => {
    nativeBlockSpy.mockClear();

    renderToStaticMarkup(React.createElement(ReviewPageBlock, { pageUid: "page-123" }));

    expect(nativeBlockSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        open: true,
        uid: "page-123",
      }),
    );
  });

  it("renders a shared weekly-review page detail surface for a page uid", () => {
    nativeBlockSpy.mockClear();

    const markup = renderToStaticMarkup(
      React.createElement(ReviewPageDetailPane, {
        pageUid: "page-123",
      }),
    );

    expect(markup).toContain("native-page-block");
    expect(nativeBlockSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        className: "gtd-project-detail-page",
        open: true,
        uid: "page-123",
      }),
    );
  });
});
