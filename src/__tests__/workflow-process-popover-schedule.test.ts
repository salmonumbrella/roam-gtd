import { JSDOM } from "jsdom";
import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentDueDateValue: vi.fn(() => ""),
  getTriageDueDateTooltipLabel: vi.fn(() => null),
  loadMatchedCalendarEventTimeLabel: vi.fn(async (): Promise<string | null> => null),
  resolveScheduleConflictMessage: vi.fn(async (): Promise<string | null> => null),
  showTriageToast: vi.fn(),
}));

vi.mock("../triage/schedule-support", () => ({
  getTriageDueDateTooltipLabel: mocks.getTriageDueDateTooltipLabel,
  loadMatchedCalendarEventTimeLabel: mocks.loadMatchedCalendarEventTimeLabel,
  resolveScheduleConflictMessage: mocks.resolveScheduleConflictMessage,
}));

vi.mock("../triage/step-logic", () => ({
  showTriageToast: mocks.showTriageToast,
}));

vi.mock("../triage/writes", () => ({
  getCurrentDueDateValue: mocks.getCurrentDueDateValue,
}));

vi.mock("../triage/form-helpers", async () => {
  const actual = await vi.importActual("../triage/form-helpers");
  return {
    ...actual,
    formatSchedulePopoverInitialValue: (
      intent?: { roamDate?: string; time?: string },
      persisted = "",
    ) => intent?.roamDate ?? persisted,
  };
});

import { useWorkflowProcessPopoverSchedule } from "../workflow-process-popover/schedule";

function flush(): Promise<void> {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("useWorkflowProcessPopoverSchedule", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    dom = new JSDOM("<div id='root'></div>");
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Node", dom.window.Node);
  });

  afterEach(() => {
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    vi.unstubAllGlobals();
    dom.window.close();
  });

  function renderHarness(props: { isOpen: boolean; targetText: string; targetUid: string | null }) {
    let current: ReturnType<typeof useWorkflowProcessPopoverSchedule> | undefined;
    const onFocusCalendarButton = vi.fn();
    const setCurrent = (value: ReturnType<typeof useWorkflowProcessPopoverSchedule>) => {
      current = value;
    };

    function Harness(nextProps: typeof props) {
      const value = useWorkflowProcessPopoverSchedule({
        isOpen: nextProps.isOpen,
        onFocusCalendarButton,
        t: (key: string) => key,
        targetText: nextProps.targetText,
        targetUid: nextProps.targetUid,
      });
      useEffect(() => {
        setCurrent(value);
      }, [value]);
      return null;
    }

    act(() => {
      ReactDOM.render(React.createElement(Harness, props), root);
    });

    return {
      get current() {
        if (!current) {
          throw new Error("Missing hook state");
        }
        return current;
      },
      onFocusCalendarButton,
      rerender(nextProps: typeof props) {
        act(() => {
          ReactDOM.render(React.createElement(Harness, nextProps), root);
        });
      },
    };
  }

  it("resets schedule state when the open target changes", async () => {
    mocks.getCurrentDueDateValue.mockReturnValueOnce("[[February 25th, 2026]]");
    const harness = renderHarness({
      isOpen: true,
      targetText: "{{[[TODO]]}} Review block",
      targetUid: "todo-1",
    });
    await flush();

    act(() => {
      harness.current.handleScheduleUnset();
    });
    expect(harness.current.unsetDue).toBe(true);

    mocks.getCurrentDueDateValue.mockReturnValueOnce("[[February 26th, 2026]]");
    harness.rerender({
      isOpen: true,
      targetText: "{{[[TODO]]}} Review block",
      targetUid: "todo-2",
    });
    await flush();

    expect(harness.current.persistedDueDate).toBe("[[February 26th, 2026]]");
    expect(harness.current.unsetDue).toBe(false);
  });

  it("loads the matched calendar time label when a persisted due date exists", async () => {
    mocks.getCurrentDueDateValue.mockReturnValueOnce("[[February 25th, 2026]]");
    mocks.loadMatchedCalendarEventTimeLabel.mockResolvedValueOnce("9:30 AM");

    renderHarness({
      isOpen: true,
      targetText: "{{[[TODO]]}} Review block",
      targetUid: "todo-1",
    });
    await flush();
    await flush();

    expect(mocks.loadMatchedCalendarEventTimeLabel).toHaveBeenCalledWith({
      persistedDueDate: "[[February 25th, 2026]]",
      targetText: "{{[[TODO]]}} Review block",
    });
  });

  it("confirms, unsets, and cancels schedule state through the controller", async () => {
    const harness = renderHarness({
      isOpen: true,
      targetText: "{{[[TODO]]}} Review block",
      targetUid: "todo-1",
    });
    await flush();

    act(() => {
      harness.current.setShowSchedulePopover(true);
    });

    await act(async () => {
      await harness.current.handleScheduleConfirm({
        date: new Date(2026, 1, 25, 9, 30),
        googleCalendarAccount: "Work Calendar",
        roamDate: "February 25th, 2026",
        time: "09:30",
      });
    });

    expect(harness.current.scheduleIntent).toEqual(
      expect.objectContaining({
        googleCalendarAccount: "Work Calendar",
        roamDate: "February 25th, 2026",
        time: "09:30",
      }),
    );
    expect(harness.current.showSchedulePopover).toBe(false);
    expect(harness.onFocusCalendarButton).toHaveBeenCalledTimes(1);

    act(() => {
      harness.current.handleScheduleUnset();
    });
    expect(harness.current.unsetDue).toBe(true);
    expect(harness.current.scheduleIntent).toBeNull();

    act(() => {
      harness.current.setShowSchedulePopover(true);
      harness.current.handleScheduleCancel();
    });
    expect(harness.current.showSchedulePopover).toBe(false);
  });
});
