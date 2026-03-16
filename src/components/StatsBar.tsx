import React from "react";

import type { TranslatorFn } from "../i18n";
import type { GtdState } from "../store";

export type DashboardTab =
  | "inbox"
  | "nextActions"
  | "waitingFor"
  | "delegated"
  | "someday"
  | "stale"
  | "deferred"
  | "projects";

interface StatsBarProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  state: GtdState;
  t: TranslatorFn;
}

interface TabConfig {
  color: string;
  key: DashboardTab;
  label: string;
}

function getTabs(t: TranslatorFn): Array<TabConfig> {
  return [
    { color: "#fab387", key: "inbox", label: t("inbox") },
    { color: "#a6e3a1", key: "nextActions", label: t("next") },
    { color: "#f9e2af", key: "waitingFor", label: t("waiting") },
    { color: "#7f849c", key: "delegated", label: t("delegated") },
    { color: "#bac2de", key: "someday", label: t("someday") },
    { color: "#f38ba8", key: "stale", label: t("stale") },
    { color: "#89b4fa", key: "deferred", label: t("deferred") },
    { color: "#cba6f7", key: "projects", label: t("projects") },
  ];
}

function getCount(state: GtdState, key: DashboardTab): number {
  if (key === "projects") {
    return state.projects.length;
  }
  return state[key].length;
}

export const StatsBar = React.memo(function StatsBar({
  activeTab,
  onTabChange,
  state,
  t,
}: StatsBarProps) {
  const tabs = getTabs(t);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
      {tabs.map(({ color, key, label }) => {
        const count = getCount(state, key);
        const isActive = activeTab === key;

        return (
          <button
            className="bp3-button bp3-minimal"
            key={key}
            onClick={() => onTabChange(key)}
            style={{
              borderBottom: isActive ? `2px solid ${color}` : "2px solid transparent",
              borderRadius: 0,
              fontWeight: isActive ? 600 : 400,
            }}
            type="button"
          >
            {label}{" "}
            <span
              className="bp3-tag bp3-minimal bp3-round"
              style={{
                backgroundColor: count > 0 ? color : undefined,
                color: count > 0 ? "#1e1e2e" : undefined,
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
});
