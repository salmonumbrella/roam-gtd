import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acceptAutocompleteSelectionOnTab: vi.fn(),
  focusTriageTabStop: vi.fn(),
  getEnabledTriageTabOrder: vi.fn(() => ["context", "delegate", "project", "calendar"]),
  getNextTriageTabStop: vi.fn(() => "delegate"),
  isAutocompleteFieldElement: vi.fn((element) =>
    Boolean(
      element &&
      typeof element === "object" &&
      "tagName" in element &&
      (element as { tagName?: string }).tagName === "INPUT",
    ),
  ),
  resolveAutocompleteContextTabStop: vi.fn(() => "context"),
}));

vi.mock("../triage/form-helpers", async () => {
  const actual = await vi.importActual("../triage/form-helpers");
  return {
    ...actual,
    acceptAutocompleteSelectionOnTab: mocks.acceptAutocompleteSelectionOnTab,
    focusTriageTabStop: mocks.focusTriageTabStop,
    getEnabledTriageTabOrder: mocks.getEnabledTriageTabOrder,
    getNextTriageTabStop: mocks.getNextTriageTabStop,
    isAutocompleteFieldElement: mocks.isAutocompleteFieldElement,
    resolveAutocompleteContextTabStop: mocks.resolveAutocompleteContextTabStop,
  };
});

vi.mock("../components/SchedulePopover", () => ({
  SCHEDULE_POPOVER_ID: "roam-gtd-schedule-popover",
}));

import { CONTEXT_AUTOCOMPLETE_ID } from "../triage/form-helpers";
import { useWorkflowProcessPopoverKeyboard } from "../workflow-process-popover/keyboard";

describe("useWorkflowProcessPopoverKeyboard", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    dom = new JSDOM("<div id='root'></div>");
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("KeyboardEvent", dom.window.KeyboardEvent);
    vi.stubGlobal("Node", dom.window.Node);
  });

  afterEach(() => {
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    vi.unstubAllGlobals();
    dom.window.close();
  });

  function renderHarness(onCancel = vi.fn()) {
    const reviewDialog = document.createElement("div");
    reviewDialog.className = "roam-gtd-review-dialog";
    document.body.append(reviewDialog);

    const anchor = document.createElement("button");
    const popover = document.createElement("div");
    const portal = document.createElement("div");
    portal.className = "roamjs-autocomplete-input";
    document.body.append(anchor, portal);
    reviewDialog.append(popover);

    const rootElement = document.createElement("div");
    rootElement.tabIndex = -1;
    popover.append(rootElement);

    const input = document.createElement("input");
    input.id = CONTEXT_AUTOCOMPLETE_ID;
    popover.append(input);

    function Harness() {
      useWorkflowProcessPopoverKeyboard({
        anchorElement: anchor,
        isOpen: true,
        onCancel,
        popoverRef: { current: popover },
        rootRef: { current: rootElement },
      });
      return null;
    }

    act(() => {
      ReactDOM.render(React.createElement(Harness), root);
    });

    return { anchor, input, onCancel, popover, portal, rootElement };
  }

  it("dismisses only for clicks outside the popover, anchor, and autocomplete portal", () => {
    const harness = renderHarness();

    document.body.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
    expect(harness.onCancel).toHaveBeenCalledTimes(1);

    harness.onCancel.mockClear();
    harness.anchor.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
    harness.popover.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
    harness.portal.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
    expect(harness.onCancel).not.toHaveBeenCalled();
  });

  it("maps escape and ctrl navigation keys for autocomplete fields", () => {
    const harness = renderHarness();
    const inputEvents: Array<string> = [];
    harness.input.addEventListener("keydown", (event) => {
      inputEvents.push((event as KeyboardEvent).key);
    });
    const focusSpy = vi.spyOn(harness.rootElement, "focus");
    harness.input.focus();

    harness.input.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        key: "n",
      }),
    );
    harness.input.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Escape",
      }),
    );

    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(inputEvents).toContain("Escape");
    expect(inputEvents).toContain("ArrowDown");
  });

  it("moves through the enabled tab order inside the popover", () => {
    const harness = renderHarness();
    harness.input.focus();

    harness.input.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Tab",
      }),
    );

    expect(mocks.acceptAutocompleteSelectionOnTab).toHaveBeenCalledWith("context");
    expect(mocks.focusTriageTabStop).toHaveBeenCalledWith("delegate");
  });
});
