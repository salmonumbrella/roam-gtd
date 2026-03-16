import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StatsBar } from "../components/StatsBar";
import { TodoList } from "../components/TodoList";
import type { GtdState } from "../store";
import type { TodoItem } from "../types";

function t(key: string, ...args: Array<string | number>): string {
  switch (key) {
    case "ageDays":
      return `age:${args[0]}`;
    case "allClear":
      return "All clear";
    case "deferred":
      return "Deferred";
    case "delegated":
      return "Delegated";
    case "dueDate":
      return `due:${args[0]}`;
    case "inbox":
      return "Inbox";
    case "markDone":
      return "Mark done";
    case "next":
      return "Next";
    case "projects":
      return "Projects";
    case "someday":
      return "Someday";
    case "stale":
      return "Stale";
    case "waiting":
      return "Waiting";
    default:
      return key;
  }
}

function createState(overrides: Partial<GtdState> = {}): GtdState {
  return {
    backHalfHydrated: false,
    backHalfLoadedAt: null,
    completedThisWeek: [],
    deferred: [],
    delegated: [],
    inbox: [],
    lastWeekMetrics: null,
    loading: false,
    nextActions: [],
    projects: [],
    projectsHydrated: false,
    projectsLoadedAt: null,
    projectsLoading: false,
    someday: [],
    stale: [],
    ticklerItems: [],
    topGoals: [],
    triagedThisWeekCount: 0,
    waitingFor: [],
    workflowHydrated: false,
    ...overrides,
  };
}

function createTodo(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    ageDays: 0,
    createdTime: 0,
    deferredDate: null,
    pageTitle: "Home",
    text: "{{[[TODO]]}} Buy milk",
    uid: "todo-1",
    ...overrides,
  };
}

describe("StatsBar", () => {
  it("renders translated tab labels and category counts", () => {
    const markup = renderToStaticMarkup(
      React.createElement(StatsBar, {
        activeTab: "projects",
        onTabChange: vi.fn(),
        state: createState({
          inbox: [createTodo({ uid: "inbox-1" })],
          nextActions: [createTodo({ uid: "next-1" }), createTodo({ uid: "next-2" })],
          projects: [
            {
              doneCount: 0,
              lastDoneTime: null,
              lastTodoCreatedTime: null,
              lastTodoText: null,
              lastTodoUid: null,
              pageTitle: "Project Alpha",
              pageUid: "project-1",
              statusBlockUid: null,
              statusText: null,
              todoCount: 3,
              todoListUid: null,
              totalCount: 3,
            },
          ],
        }),
        t,
      }),
    );

    expect(markup).toContain("Inbox");
    expect(markup).toContain("Next");
    expect(markup).toContain("Projects");
    expect(markup).toContain(">1<");
    expect(markup).toContain(">2<");
    expect(markup).toContain(">0<");
    expect(markup).toContain("border-bottom:2px solid #cba6f7");
  });
});

describe("TodoList", () => {
  it("renders an empty state when there are no items", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TodoList, {
        items: [],
        onMarkDone: vi.fn(),
        onOpenInSidebar: vi.fn(),
        t,
      }),
    );

    expect(markup).toContain("All clear");
    expect(markup).toContain("bp3-non-ideal-state");
  });

  it("renders cleaned todo text, age, and deferred date metadata", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TodoList, {
        items: [
          createTodo({
            ageDays: 16,
            deferredDate: "March 10th, 2026",
            pageTitle: "Errands",
            text: "{{[[TODO]]}} Buy milk",
          }),
        ],
        onMarkDone: vi.fn(),
        onOpenInSidebar: vi.fn(),
        showDeferred: true,
        t,
      }),
    );

    expect(markup).toContain("Buy milk");
    expect(markup).toContain("Errands");
    expect(markup).toContain("age:16");
    expect(markup).toContain("due:March 10th, 2026");
    expect(markup).toContain("color:#f38ba8");
  });

  it("omits optional metadata when age is zero or the flags are disabled", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TodoList, {
        items: [
          createTodo({
            ageDays: 0,
            deferredDate: "March 10th, 2026",
          }),
        ],
        onMarkDone: vi.fn(),
        onOpenInSidebar: vi.fn(),
        showAge: false,
        showDeferred: false,
        t,
      }),
    );

    expect(markup).not.toContain("age:");
    expect(markup).not.toContain("due:");
  });
});
