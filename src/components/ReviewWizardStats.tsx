import React from "react";

import type { TranslatorFn } from "../i18n";
import type { GtdState } from "../store";
import type { WeeklyMetrics } from "../types";

function getArrowColor(delta: number, invertGood: boolean): string {
  const isGood = invertGood ? delta < 0 : delta > 0;
  const absDelta = Math.abs(delta);
  let tier = 4;
  if (absDelta <= 5) {
    tier = 0;
  } else if (absDelta <= 15) {
    tier = 1;
  } else if (absDelta <= 30) {
    tier = 2;
  } else if (absDelta <= 50) {
    tier = 3;
  }

  const greens = ["#a6e3a1", "#7dd87d", "#56d156", "#2fc92f", "#1db91d"];
  const reds = ["#f38ba8", "#e86b8a", "#dd4b6c", "#d22b4e", "#c71230"];
  if (delta === 0) {
    return "#7f849c";
  }
  return isGood ? greens[tier] : reds[tier];
}

export function ReviewWizardStats({
  lastWeekMetrics,
  state,
  t,
}: {
  lastWeekMetrics: WeeklyMetrics | null;
  state: GtdState;
  t: TranslatorFn;
}) {
  const metrics: Array<{
    current: number;
    invertGood: boolean;
    label: string;
    neutral: boolean;
    previous: number | null;
  }> = [
    {
      current: state.completedThisWeek.length,
      invertGood: false,
      label: t("completed"),
      neutral: false,
      previous: lastWeekMetrics?.completed ?? null,
    },
    {
      current: state.nextActions.length,
      invertGood: false,
      label: t("nextActions"),
      neutral: true,
      previous: lastWeekMetrics?.nextActions ?? null,
    },
    {
      current: state.waitingFor.length,
      invertGood: true,
      label: t("waiting"),
      neutral: false,
      previous: lastWeekMetrics?.waitingFor ?? null,
    },
    {
      current: state.delegated.length,
      invertGood: false,
      label: t("delegated"),
      neutral: true,
      previous: lastWeekMetrics?.delegated ?? null,
    },
    {
      current: state.someday.length,
      invertGood: false,
      label: t("someday"),
      neutral: true,
      previous: lastWeekMetrics?.someday ?? null,
    },
    {
      current: state.projects.length,
      invertGood: false,
      label: t("projects"),
      neutral: true,
      previous: lastWeekMetrics?.projects ?? null,
    },
    {
      current: state.stale.length,
      invertGood: true,
      label: t("stale"),
      neutral: false,
      previous: lastWeekMetrics?.stale ?? null,
    },
  ];

  return (
    <div>
      <div
        style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 16 }}
      >
        {metrics.map((metric) => {
          const delta = metric.previous != null ? metric.current - metric.previous : null;
          const pct =
            delta != null && metric.previous != null && metric.previous > 0
              ? Math.round(Math.abs(delta / metric.previous) * 100)
              : null;
          const arrowColor =
            delta != null && !metric.neutral ? getArrowColor(delta, metric.invertGood) : "#7f849c";
          const arrow = delta != null && delta !== 0 ? (delta > 0 ? "\u25B2" : "\u25BC") : "\u2014";

          return (
            <div className="bp3-card" key={metric.label} style={{ padding: "10px 12px" }}>
              <div style={{ color: "#A5A5A5", fontSize: 11, marginBottom: 2 }}>{metric.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{metric.current}</div>
              {delta != null ? (
                <div style={{ color: arrowColor, fontSize: 11, marginTop: 2 }}>
                  <span>{arrow}</span>
                  {pct != null && delta !== 0 ? ` ${pct}%` : ""}
                  <span style={{ color: "#7f849c" }}> vs {metric.previous}</span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
