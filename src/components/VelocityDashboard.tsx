import React, { useEffect, useMemo } from "react";

import { getISOWeekNumber } from "../date-utils";
import type { TranslatorFn } from "../i18n";
import { computeWeekOverWeekDelta } from "../store/dashboard-derived";
import type { WeeklyMetrics } from "../types";
import { ensureVelocityDashboardStyle } from "./velocity-dashboard-styles";

const NO_VALUE = "\u2014";
const UP_ARROW = "\u2191";
const DOWN_ARROW = "\u2193";

type MetricDeltaMode = "downGood" | "neutral" | "upGood";

export interface VelocityDashboardProps {
  avgTimeDays: number | null;
  completedCount: number;
  delegatedCount: number;
  lastWeekMetrics: WeeklyMetrics | null;
  loading?: boolean;
  t: TranslatorFn;
  triagedCount: number;
  upcomingCount: number;
  waitingForCount: number;
  weekEnd: Date;
  weekStart: Date;
}

interface MetricCardProps {
  accentColor: string;
  deltaMode: MetricDeltaMode;
  label: string;
  previousValue: number | null | undefined;
  value: number;
}

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long" }).format(date);
}

function formatDateRange(start: Date, endExclusive: Date): string {
  const inclusiveEnd = new Date(endExclusive);
  inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);

  const sameYear = start.getFullYear() === inclusiveEnd.getFullYear();
  const sameMonth = sameYear && start.getMonth() === inclusiveEnd.getMonth();
  if (sameMonth) {
    return `${formatShortDate(start)} - ${inclusiveEnd.getDate()}, ${inclusiveEnd.getFullYear()}`;
  }
  if (sameYear) {
    return `${formatShortDate(start)} - ${formatShortDate(inclusiveEnd)}, ${inclusiveEnd.getFullYear()}`;
  }
  return `${formatShortDate(start)}, ${start.getFullYear()} - ${formatShortDate(inclusiveEnd)}, ${inclusiveEnd.getFullYear()}`;
}

function formatCompactDays(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return NO_VALUE;
  }
  return `${Math.round(value)}d`;
}

function getDeltaColor(direction: "down" | "flat" | "up", mode: MetricDeltaMode): string {
  if (direction === "flat" || mode === "neutral") {
    return "#7f849c";
  }
  if ((mode === "upGood" && direction === "up") || (mode === "downGood" && direction === "down")) {
    return "#a6e3a1";
  }
  return "#f38ba8";
}

function formatCountDelta(
  current: number,
  previous: number | null | undefined,
  mode: MetricDeltaMode,
): { color: string; text: string } {
  const delta = computeWeekOverWeekDelta(current, previous);
  if (delta == null) {
    return { color: "#7f849c", text: "no prior data" };
  }
  if (delta.direction === "flat") {
    return { color: "#7f849c", text: "no change" };
  }

  const arrow = delta.direction === "up" ? UP_ARROW : DOWN_ARROW;
  return {
    color: getDeltaColor(delta.direction, mode),
    text: `${arrow} ${delta.pct}% vs ${delta.previous} last week`,
  };
}

function formatAvgTimeDelta(
  current: number | null,
  previous: number | null | undefined,
): { color: string; text: string } {
  if (previous == null) {
    return { color: "#7f849c", text: "no prior data" };
  }
  if (current == null) {
    return { color: "#7f849c", text: `was ${formatCompactDays(previous)}` };
  }

  const difference = Math.round(current - previous);
  if (Math.abs(difference) < 1) {
    return { color: "#7f849c", text: "no change" };
  }

  const direction = difference > 0 ? "up" : "down";
  const arrow = direction === "up" ? UP_ARROW : DOWN_ARROW;
  return {
    color: getDeltaColor(direction, "downGood"),
    text: `${arrow} ${formatCompactDays(Math.abs(difference))} was ${formatCompactDays(previous)}`,
  };
}

function MetricCard({ accentColor, deltaMode, label, previousValue, value }: MetricCardProps) {
  const delta = formatCountDelta(value, previousValue, deltaMode);

  return (
    <div className="gtd-velocity-dashboard__metric-card">
      <span className="gtd-velocity-dashboard__metric-card-label">{label}</span>
      <span className="gtd-velocity-dashboard__metric-card-value" style={{ color: accentColor }}>
        {value}
      </span>
      <span className="gtd-velocity-dashboard__metric-card-subtext" style={{ color: delta.color }}>
        {delta.text}
      </span>
    </div>
  );
}

function LoadingMetricCard() {
  return (
    <div className="gtd-velocity-dashboard__metric-card">
      <div
        className="gtd-skeleton gtd-velocity-dashboard__skeleton-text"
        style={{ width: "34%" }}
      />
      <div
        className="gtd-skeleton gtd-velocity-dashboard__skeleton-text"
        style={{ height: 28, width: "42%" }}
      />
      <div
        className="gtd-skeleton gtd-velocity-dashboard__skeleton-text"
        style={{ width: "74%" }}
      />
    </div>
  );
}

export function VelocityDashboard({
  avgTimeDays,
  completedCount,
  delegatedCount,
  lastWeekMetrics,
  loading = false,
  t,
  triagedCount,
  upcomingCount,
  waitingForCount,
  weekEnd,
  weekStart,
}: VelocityDashboardProps) {
  useEffect(() => {
    ensureVelocityDashboardStyle();
  }, []);

  const weekNumber = useMemo(() => getISOWeekNumber(weekStart), [weekStart]);
  const avgTimeDelta = formatAvgTimeDelta(avgTimeDays, lastWeekMetrics?.avgTime);

  return (
    <div className="gtd-velocity-dashboard" data-testid="velocity-dashboard">
      <header className="gtd-velocity-dashboard__header">
        <span className="gtd-velocity-dashboard__week-label">{t("weekLabel", weekNumber)}</span>
        <span className="gtd-velocity-dashboard__date-range">
          {formatDateRange(weekStart, weekEnd)}
        </span>
      </header>

      <div className="gtd-velocity-dashboard__metric-grid gtd-velocity-dashboard__metric-grid--three">
        {loading ? (
          <>
            <LoadingMetricCard />
            <LoadingMetricCard />
            <LoadingMetricCard />
          </>
        ) : (
          <>
            <MetricCard
              accentColor="#cba6f7"
              deltaMode="neutral"
              label="Triage"
              previousValue={null}
              value={triagedCount}
            />
            <MetricCard
              accentColor="#89b4fa"
              deltaMode="upGood"
              label="Done"
              previousValue={lastWeekMetrics?.completed}
              value={completedCount}
            />
            <div className="gtd-velocity-dashboard__metric-card">
              <span className="gtd-velocity-dashboard__metric-card-label">Avg Time</span>
              <span
                className="gtd-velocity-dashboard__metric-card-value"
                style={{ color: "#fab387" }}
              >
                {formatCompactDays(avgTimeDays)}
              </span>
              <span
                className="gtd-velocity-dashboard__metric-card-subtext"
                style={{ color: avgTimeDelta.color }}
              >
                {avgTimeDelta.text}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="gtd-velocity-dashboard__metric-grid gtd-velocity-dashboard__metric-grid--three">
        {loading ? (
          <>
            <LoadingMetricCard />
            <LoadingMetricCard />
            <LoadingMetricCard />
          </>
        ) : (
          <>
            <MetricCard
              accentColor="#a6e3a1"
              deltaMode="neutral"
              label="Upcoming"
              previousValue={lastWeekMetrics?.nextActions}
              value={upcomingCount}
            />
            <MetricCard
              accentColor="#f9e2af"
              deltaMode="downGood"
              label={t("watching")}
              previousValue={lastWeekMetrics?.waitingFor}
              value={waitingForCount}
            />
            <MetricCard
              accentColor="#fab387"
              deltaMode="neutral"
              label={t("delegated")}
              previousValue={lastWeekMetrics?.delegated}
              value={delegatedCount}
            />
          </>
        )}
      </div>
    </div>
  );
}
