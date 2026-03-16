import React from "react";

import { ReviewWizard, type ReviewWizardProps } from "./ReviewWizard";

export type WeeklyReviewModalProps = Omit<ReviewWizardProps, "mode">;

export function WeeklyReviewModal(props: WeeklyReviewModalProps) {
  return <ReviewWizard {...props} mode="weekly" />;
}
