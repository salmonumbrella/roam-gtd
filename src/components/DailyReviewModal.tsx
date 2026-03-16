import React from "react";

import { ReviewWizard, type ReviewWizardProps } from "./ReviewWizard";

export type DailyReviewModalProps = Omit<ReviewWizardProps, "mode">;

export function DailyReviewModal(props: DailyReviewModalProps) {
  return <ReviewWizard {...props} mode="daily" />;
}
