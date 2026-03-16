export const REVIEW_DIALOG_WIDTH_PX = 780;
export const REVIEW_DIALOG_HEIGHT_PX = 520;
export const REVIEW_DIALOG_MARGIN_TOP_PX = -10;
export const REVIEW_DIALOG_MAX_WIDTH = "95vw";
export const REVIEW_DIALOG_WIDTH = `var(--roam-gtd-review-dialog-width, ${REVIEW_DIALOG_WIDTH_PX}px)`;
export const REVIEW_DIALOG_HEIGHT = `var(--roam-gtd-review-dialog-height, ${REVIEW_DIALOG_HEIGHT_PX}px)`;
export const REVIEW_DIALOG_MARGIN_TOP = `var(--roam-gtd-review-dialog-margin-top, ${REVIEW_DIALOG_MARGIN_TOP_PX}px)`;
export const REVIEW_DIALOG_MAX_WIDTH_CSS = `var(--roam-gtd-review-dialog-max-width, ${REVIEW_DIALOG_MAX_WIDTH})`;

export const REVIEW_DIALOG_STYLE = {
  height: REVIEW_DIALOG_HEIGHT,
  marginTop: REVIEW_DIALOG_MARGIN_TOP,
  maxHeight: REVIEW_DIALOG_HEIGHT,
  maxWidth: REVIEW_DIALOG_MAX_WIDTH_CSS,
  minHeight: REVIEW_DIALOG_HEIGHT,
  width: REVIEW_DIALOG_WIDTH,
} as const;
