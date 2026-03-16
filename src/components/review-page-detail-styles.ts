import type { CSSProperties } from "react";

const REVIEW_PAGE_DETAIL_STYLE_ID = "gtd-review-page-detail-style";

const REVIEW_PAGE_DETAIL_STYLE = `
  .gtd-project-detail-panel {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }
  .gtd-project-detail-page {
    box-sizing: border-box;
    border-radius: 10px;
    flex: 1;
    max-width: 100%;
    min-height: 0;
    min-width: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 6px 4px 6px 8px;
    width: 100%;
  }
  .gtd-project-detail-page .rm-api-render--block,
  .gtd-project-detail-page .rm-block,
  .gtd-project-detail-page .rm-block-children,
  .gtd-project-detail-page .rm-block-main {
    max-width: 100%;
    min-width: 0;
  }
`;

export const REVIEW_PAGE_DETAIL_WRAPPER_STYLE: CSSProperties = {
  display: "flex",
  flex: 1,
  flexDirection: "column",
  minHeight: 0,
};

export function ensureReviewPageDetailStyle(): void {
  if (document.getElementById(REVIEW_PAGE_DETAIL_STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = REVIEW_PAGE_DETAIL_STYLE_ID;
  style.textContent = REVIEW_PAGE_DETAIL_STYLE;
  document.head.append(style);
}
