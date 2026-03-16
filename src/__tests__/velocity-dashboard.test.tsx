import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectBurnupSparkline } from "../components/ProjectBurnupSparkline";
import { VelocityDashboard } from "../components/VelocityDashboard";
import type { WeeklyMetrics } from "../types";

function t(key: string, ...args: Array<string | number>): string {
  switch (key) {
    case "delegated":
      return "Delegated";
    case "watching":
      return "Watch";
    case "weekLabel":
      return `Week ${args[0]}`;
    case "weeklyReview":
      return "Weekly Review";
    default:
      return key;
  }
}

const LAST_WEEK_METRICS: WeeklyMetrics = {
  avgTime: 2.7,
  completed: 20,
  delegated: 5,
  nextActions: 11,
  projects: 3,
  someday: 0,
  stale: 0,
  waitingFor: 10,
};

describe("ProjectBurnupSparkline", () => {
  it("renders fallback lines when there is no burn-up history", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ProjectBurnupSparkline, {
        color: "#89b4fa",
        data: [],
      }),
    );

    expect(markup).toContain("polyline");
    expect(markup).toContain("0.00,20.00 48.00,20.00");
  });

  it("renders provided scope and completed lines for multi-point history", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ProjectBurnupSparkline, {
        color: "#89b4fa",
        data: [
          { completed: 0, scope: 1 },
          { completed: 1, scope: 2 },
          { completed: 2, scope: 3 },
        ],
      }),
    );

    expect(markup).toContain('stroke="#89b4fa"');
    expect(markup).toContain('stroke-dasharray="2 2"');
  });
});

describe("VelocityDashboard", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    dom = new JSDOM("<div id='root'></div>", { url: "https://example.com" });
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Node", dom.window.Node);
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(root);
    vi.unstubAllGlobals();
    dom.window.close();
  });

  it("renders hero metrics and category cards", () => {
    const markup = renderToStaticMarkup(
      React.createElement(VelocityDashboard, {
        avgTimeDays: 3.2,
        completedCount: 23,
        delegatedCount: 5,
        lastWeekMetrics: LAST_WEEK_METRICS,
        t,
        triagedCount: 0,
        upcomingCount: 12,
        waitingForCount: 8,
        weekEnd: new Date(2026, 2, 16),
        weekStart: new Date(2026, 2, 9),
      }),
    );

    expect(markup).toContain("Upcoming");
    expect(markup).toContain("Watch");
    expect(markup).toContain("Delegated");
    expect(markup).toContain("Done");
    expect(markup).toContain("3d");
  });

  it("renders loading skeletons when loading", () => {
    const markup = renderToStaticMarkup(
      React.createElement(VelocityDashboard, {
        avgTimeDays: null,
        completedCount: 0,
        delegatedCount: 0,
        lastWeekMetrics: null,
        loading: true,
        t,
        triagedCount: 0,
        upcomingCount: 0,
        waitingForCount: 0,
        weekEnd: new Date(2026, 2, 16),
        weekStart: new Date(2026, 2, 9),
      }),
    );

    expect(markup).toContain("gtd-skeleton");
  });

  it("renders metric cards as non-interactive divs", () => {
    const markup = renderToStaticMarkup(
      React.createElement(VelocityDashboard, {
        avgTimeDays: 1.5,
        completedCount: 4,
        delegatedCount: 2,
        lastWeekMetrics: LAST_WEEK_METRICS,
        t,
        triagedCount: 5,
        upcomingCount: 3,
        waitingForCount: 1,
        weekEnd: new Date(2026, 2, 16),
        weekStart: new Date(2026, 2, 9),
      }),
    );

    expect(markup).not.toContain("<button");
    expect(markup).toContain("Upcoming");
    expect(markup).toContain("Triage");
  });
});
