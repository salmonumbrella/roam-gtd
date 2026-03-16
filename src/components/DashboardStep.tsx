import React from "react";

import { getISOWeekNumber, getMondayOfWeek } from "../date-utils";
import type { TranslatorFn } from "../i18n";
import type { GtdState } from "../store";
import { ReviewWizardStats } from "./ReviewWizardStats";

interface DashboardStepProps {
  state: GtdState;
  t: TranslatorFn;
}

export function DashboardStep({ state, t }: DashboardStepProps) {
  return (
    <>
      <p
        style={{
          color: "#A5A5A5",
          fontSize: 12,
          lineHeight: 1.5,
          margin: "0 0 12px 0",
          minHeight: 18,
        }}
      >
        {t("weekLabel", getISOWeekNumber(getMondayOfWeek(new Date())))}
      </p>
      <ReviewWizardStats lastWeekMetrics={state.lastWeekMetrics} state={state} t={t} />
    </>
  );
}
