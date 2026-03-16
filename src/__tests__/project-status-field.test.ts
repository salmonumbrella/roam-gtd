import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectStatusField } from "../components/projects-step/ProjectStatusField";
import type { ProjectSummary } from "../types";

function makeProject(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    doneCount: 0,
    lastDoneTime: null,
    lastTodoCreatedTime: 1,
    lastTodoText: "{{[[TODO]]}} Project todo",
    lastTodoUid: "todo-1",
    pageTitle: "Project:: Launch release",
    pageUid: "project-1",
    statusBlockUid: null,
    statusText: "ON_TRACK",
    todoCount: 1,
    todoListUid: "list-1",
    totalCount: 1,
    ...overrides,
  };
}

describe("ProjectStatusField", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    dom = new JSDOM("<div id='root'></div>");
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("KeyboardEvent", dom.window.KeyboardEvent);
    vi.stubGlobal("MouseEvent", dom.window.MouseEvent);
    vi.stubGlobal("Node", dom.window.Node);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      dom.window.setTimeout(() => callback(0), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => dom.window.clearTimeout(handle));
    Object.assign(globalThis.window, {
      cancelAnimationFrame: globalThis.cancelAnimationFrame,
      requestAnimationFrame: globalThis.requestAnimationFrame,
    });
  });

  afterEach(() => {
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    vi.unstubAllGlobals();
    dom.window.close();
  });

  it("opens the menu from the button and applies a selected status", async () => {
    const onChangeStatus = vi.fn(() => true);

    await act(async () => {
      ReactDOM.render(
        React.createElement(ProjectStatusField, {
          emptyLabel: "None",
          onChangeStatus,
          options: ["ON_TRACK", "LAGGING"],
          project: makeProject(),
        }),
        root,
      );
    });

    const trigger = root.querySelector("button");
    expect(trigger).not.toBeNull();

    act(() => {
      trigger?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });

    const optionButtons = root.querySelectorAll(".gtd-project-status-option");
    expect(optionButtons.length).toBe(2);

    act(() => {
      optionButtons[1]?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });

    expect(onChangeStatus).toHaveBeenCalledWith(makeProject(), "LAGGING");
  });

  it("keeps the current status available even when no options are loaded", async () => {
    await act(async () => {
      ReactDOM.render(
        React.createElement(ProjectStatusField, {
          emptyLabel: "None",
          onChangeStatus: vi.fn(() => true),
          options: [],
          project: makeProject(),
        }),
        root,
      );
    });

    const trigger = root.querySelector("button");
    expect(trigger).not.toBeNull();

    act(() => {
      trigger?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });

    const optionButtons = root.querySelectorAll(".gtd-project-status-option");
    expect(optionButtons).toHaveLength(1);
    expect(optionButtons[0]?.textContent).toContain("ON_TRACK");
  });
});
