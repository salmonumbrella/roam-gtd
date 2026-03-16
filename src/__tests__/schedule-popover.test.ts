import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const googleCalendarMocks = vi.hoisted(() => ({
  isGoogleCalendarAvailable: vi.fn(() => true),
  listGoogleCalendarAccountOptions: vi.fn(async () => [
    { account: "Work Calendar" },
    { account: "Personal Calendar" },
  ]),
}));

vi.mock("../google-calendar", () => ({
  isGoogleCalendarAvailable: googleCalendarMocks.isGoogleCalendarAvailable,
  listGoogleCalendarAccountOptions: googleCalendarMocks.listGoogleCalendarAccountOptions,
}));

import {
  expandDatePrefixes,
  getNextScheduleTabIndex,
  getScheduleEscapeAction,
  parseNlpDate,
  SchedulePopover,
} from "../components/SchedulePopover";
import { formatRoamDate, parseRoamDate } from "../date-utils";

function t(key: string): string {
  switch (key) {
    case "scheduleCancel":
      return "Cancel";
    case "scheduleConfirm":
      return "Set Due Date";
    case "scheduleDueDate":
      return "Set Due Date";
    case "scheduleGcalIndicator":
      return "Add to Google Calendar";
    case "scheduleGoogleAccountLabel":
      return "Calendar";
    case "scheduleParseError":
      return "Could not parse date";
    case "schedulePlaceholder":
      return "Tomorrow, next Friday, Mar 15 at 2pm";
    case "scheduleUnset":
      return "Unset";
    default:
      return key;
  }
}

describe("schedule date formatting", () => {
  it("formats a date as Roam date reference text", () => {
    const date = new Date(2026, 1, 24); // Feb 24, 2026
    expect(formatRoamDate(date)).toBe("February 24th, 2026");
  });

  it("uses correct ordinal suffixes", () => {
    expect(formatRoamDate(new Date(2026, 0, 1))).toBe("January 1st, 2026");
    expect(formatRoamDate(new Date(2026, 0, 2))).toBe("January 2nd, 2026");
    expect(formatRoamDate(new Date(2026, 0, 3))).toBe("January 3rd, 2026");
    expect(formatRoamDate(new Date(2026, 0, 4))).toBe("January 4th, 2026");
    expect(formatRoamDate(new Date(2026, 0, 11))).toBe("January 11th, 2026");
    expect(formatRoamDate(new Date(2026, 0, 21))).toBe("January 21st, 2026");
    expect(formatRoamDate(new Date(2026, 0, 22))).toBe("January 22nd, 2026");
    expect(formatRoamDate(new Date(2026, 0, 23))).toBe("January 23rd, 2026");
    expect(formatRoamDate(new Date(2026, 0, 31))).toBe("January 31st, 2026");
  });

  it("parses Roam date strings with or without ordinal suffixes", () => {
    expect(parseRoamDate("February 28th, 2026")).toEqual(new Date(2026, 1, 28));
    expect(parseRoamDate("March 15, 2026")).toEqual(new Date(2026, 2, 15));
  });

  it("returns null for invalid Roam date strings", () => {
    expect(parseRoamDate("")).toBeNull();
    expect(parseRoamDate("March 44th, 2026")).toBeNull();
    expect(parseRoamDate("Not a date")).toBeNull();
  });
});

describe("schedule popover escape behavior", () => {
  it("resets first when input differs from the initial value", () => {
    expect(getScheduleEscapeAction("Monday at 3pm", "Monday")).toBe("reset");
    expect(getScheduleEscapeAction("tomorrow", "")).toBe("reset");
  });

  it("closes when input already matches the initial value", () => {
    expect(getScheduleEscapeAction("Monday", "Monday")).toBe("close");
    expect(getScheduleEscapeAction("", "")).toBe("close");
  });
});

describe("parseNlpDate normalizes partial am/pm suffixes", () => {
  it("treats trailing 'p' after a digit as 'pm'", () => {
    const result = parseNlpDate("next friday at 8p");
    expect(result).not.toBeNull();
    expect(result!.hasTime).toBe(true);
    expect(result!.date.getHours()).toBe(20);
  });

  it("treats trailing 'a' after a digit as 'am'", () => {
    const result = parseNlpDate("tomorrow at 11a");
    expect(result).not.toBeNull();
    expect(result!.hasTime).toBe(true);
    expect(result!.date.getHours()).toBe(11);
  }, 15_000);

  it("parses full 'am'/'pm' unchanged", () => {
    const pm = parseNlpDate("tomorrow at 2pm");
    expect(pm!.hasTime).toBe(true);
    expect(pm!.date.getHours()).toBe(14);

    const am = parseNlpDate("tomorrow at 8am");
    expect(am!.hasTime).toBe(true);
    expect(am!.date.getHours()).toBe(8);
  });
});

describe("expandDatePrefixes expands partial date phrases", () => {
  it("expands 'to' to 'today'", () => {
    expect(expandDatePrefixes("to")).toBe("today");
    expect(expandDatePrefixes("tod")).toBe("today");
    expect(expandDatePrefixes("toda")).toBe("today");
  });

  it("expands 'tom' to 'tomorrow'", () => {
    expect(expandDatePrefixes("tom")).toBe("tomorrow");
    expect(expandDatePrefixes("tomo")).toBe("tomorrow");
    expect(expandDatePrefixes("tomor")).toBe("tomorrow");
  });

  it("expands 'y' to 'yesterday'", () => {
    expect(expandDatePrefixes("y")).toBe("yesterday");
    expect(expandDatePrefixes("yes")).toBe("yesterday");
    expect(expandDatePrefixes("yester")).toBe("yesterday");
  });

  it("expands 2-char day name prefixes through intermediate states", () => {
    expect(expandDatePrefixes("su")).toBe("sunday");
    expect(expandDatePrefixes("sun")).toBe("sunday");
    expect(expandDatePrefixes("sund")).toBe("sunday");
    expect(expandDatePrefixes("sunda")).toBe("sunday");

    expect(expandDatePrefixes("mo")).toBe("monday");
    expect(expandDatePrefixes("mon")).toBe("monday");
    expect(expandDatePrefixes("mond")).toBe("monday");
    expect(expandDatePrefixes("monda")).toBe("monday");

    expect(expandDatePrefixes("tu")).toBe("tuesday");
    expect(expandDatePrefixes("tue")).toBe("tuesday");
    expect(expandDatePrefixes("tues")).toBe("tuesday");
    expect(expandDatePrefixes("tuesd")).toBe("tuesday");

    expect(expandDatePrefixes("we")).toBe("wednesday");
    expect(expandDatePrefixes("wed")).toBe("wednesday");
    expect(expandDatePrefixes("wedn")).toBe("wednesday");
    expect(expandDatePrefixes("wedne")).toBe("wednesday");

    expect(expandDatePrefixes("th")).toBe("thursday");
    expect(expandDatePrefixes("thu")).toBe("thursday");
    expect(expandDatePrefixes("thur")).toBe("thursday");
    expect(expandDatePrefixes("thurs")).toBe("thursday");
    expect(expandDatePrefixes("thursd")).toBe("thursday");

    expect(expandDatePrefixes("fr")).toBe("friday");
    expect(expandDatePrefixes("fri")).toBe("friday");
    expect(expandDatePrefixes("frid")).toBe("friday");
    expect(expandDatePrefixes("frida")).toBe("friday");

    expect(expandDatePrefixes("sa")).toBe("saturday");
    expect(expandDatePrefixes("sat")).toBe("saturday");
    expect(expandDatePrefixes("satu")).toBe("saturday");
    expect(expandDatePrefixes("satur")).toBe("saturday");
    expect(expandDatePrefixes("saturd")).toBe("saturday");
    expect(expandDatePrefixes("saturda")).toBe("saturday");
  });

  it("does not expand complete day names", () => {
    expect(expandDatePrefixes("sunday")).toBe("sunday");
    expect(expandDatePrefixes("monday")).toBe("monday");
    expect(expandDatePrefixes("tuesday")).toBe("tuesday");
    expect(expandDatePrefixes("wednesday")).toBe("wednesday");
    expect(expandDatePrefixes("thursday")).toBe("thursday");
    expect(expandDatePrefixes("friday")).toBe("friday");
    expect(expandDatePrefixes("saturday")).toBe("saturday");
  });

  it("does not expand complete words", () => {
    expect(expandDatePrefixes("today")).toBe("today");
    expect(expandDatePrefixes("tomorrow")).toBe("tomorrow");
    expect(expandDatePrefixes("yesterday")).toBe("yesterday");
  });

  it("expands two-word prefixes like 'next wee'", () => {
    expect(expandDatePrefixes("next wee")).toBe("next week");
    expect(expandDatePrefixes("next mon")).toBe("next month");
    expect(expandDatePrefixes("next yea")).toBe("next year");
    expect(expandDatePrefixes("last wee")).toBe("last week");
    expect(expandDatePrefixes("last mon")).toBe("last month");
  });

  it("does not expand ambiguous or too-short prefixes", () => {
    expect(expandDatePrefixes("t")).toBe("t");
    expect(expandDatePrefixes("s")).toBe("s");
    expect(expandDatePrefixes("m")).toBe("m");
    expect(expandDatePrefixes("f")).toBe("f");
    expect(expandDatePrefixes("w")).toBe("w");
    expect(expandDatePrefixes("next we")).toBe("next we");
  });

  it("returns input unchanged when no prefix matches", () => {
    expect(expandDatePrefixes("friday")).toBe("friday");
    expect(expandDatePrefixes("next friday")).toBe("next friday");
    expect(expandDatePrefixes("march 15")).toBe("march 15");
  });
});

describe("parseNlpDate resolves partial date phrases", () => {
  it("parses 'to' as today", () => {
    const result = parseNlpDate("to");
    expect(result).not.toBeNull();
    const today = new Date();
    expect(result!.date.getDate()).toBe(today.getDate());
    expect(result!.date.getMonth()).toBe(today.getMonth());
  });

  it("parses 'tom' as tomorrow", () => {
    const result = parseNlpDate("tom");
    expect(result).not.toBeNull();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(result!.date.getDate()).toBe(tomorrow.getDate());
    expect(result!.date.getMonth()).toBe(tomorrow.getMonth());
  });

  it("parses 'y' as yesterday", () => {
    const result = parseNlpDate("y");
    expect(result).not.toBeNull();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(result!.date.getDate()).toBe(yesterday.getDate());
    expect(result!.date.getMonth()).toBe(yesterday.getMonth());
  });
});

describe("schedule popover tab cycle", () => {
  it("moves focus forward and wraps to the first focusable control", () => {
    expect(getNextScheduleTabIndex(-1, 3, false)).toBe(0);
    expect(getNextScheduleTabIndex(0, 3, false)).toBe(1);
    expect(getNextScheduleTabIndex(1, 3, false)).toBe(2);
    expect(getNextScheduleTabIndex(2, 3, false)).toBe(0);
  });

  it("moves focus backward and wraps to the last focusable control", () => {
    expect(getNextScheduleTabIndex(0, 3, true)).toBe(2);
    expect(getNextScheduleTabIndex(2, 3, true)).toBe(1);
  });

  it("returns -1 for empty focusable sets", () => {
    expect(getNextScheduleTabIndex(0, 0, false)).toBe(-1);
  });
});

describe("schedule popover calendar account selector", () => {
  let dom: JSDOM;
  let root: HTMLDivElement;

  beforeEach(() => {
    dom = new JSDOM("<div id='root'></div>");
    root = dom.window.document.getElementById("root") as HTMLDivElement;
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("Node", dom.window.Node);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("MutationObserver", dom.window.MutationObserver);
    vi.stubGlobal("MouseEvent", dom.window.MouseEvent);
    Reflect.set(
      globalThis.window as object,
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      },
    );
    Reflect.set(globalThis.window as object, "cancelAnimationFrame", vi.fn());
    Object.defineProperty(dom.window.HTMLElement.prototype, "attachEvent", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(dom.window.HTMLElement.prototype, "detachEvent", {
      configurable: true,
      value: vi.fn(),
    });
    googleCalendarMocks.isGoogleCalendarAvailable.mockReturnValue(true);
    googleCalendarMocks.listGoogleCalendarAccountOptions.mockResolvedValue([
      { account: "Work Calendar" },
      { account: "Personal Calendar" },
    ]);
  });

  afterEach(() => {
    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    vi.unstubAllGlobals();
    dom.window.close();
  });

  it("renders a custom dropdown button and confirms the selected calendar account", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    await act(async () => {
      ReactDOM.render(
        React.createElement(SchedulePopover, {
          initialValue: "tomorrow at 3pm",
          onCancel,
          onConfirm,
          t,
        }),
        root,
      );
      await Promise.resolve();
    });

    expect(root.querySelector("select")).toBeNull();

    const accountButton = root.querySelector(
      "button[aria-label='Calendar']",
    ) as HTMLButtonElement | null;
    expect(accountButton).not.toBeNull();
    expect(accountButton?.textContent).toContain("Work Calendar");
    expect(accountButton?.querySelector(".bp3-icon-chevron-down")).not.toBeNull();

    await act(async () => {
      accountButton?.click();
      await Promise.resolve();
    });

    const personalOption = Array.from(root.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Personal Calendar"),
    ) as HTMLButtonElement | undefined;
    expect(personalOption).toBeDefined();

    await act(async () => {
      personalOption?.click();
      await Promise.resolve();
    });

    const confirmButton = Array.from(root.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Set Due Date"),
    ) as HTMLButtonElement | undefined;
    expect(confirmButton).toBeDefined();

    await act(async () => {
      confirmButton?.click();
      await Promise.resolve();
    });

    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        googleCalendarAccount: "Personal Calendar",
      }),
    );
  });

  it("supports keyboard navigation through the custom calendar account menu", async () => {
    await act(async () => {
      ReactDOM.render(
        React.createElement(SchedulePopover, {
          initialValue: "tomorrow at 3pm",
          onCancel: vi.fn(),
          onConfirm: vi.fn(),
          t,
        }),
        root,
      );
      await Promise.resolve();
    });

    const accountButton = root.querySelector(
      "button[aria-label='Calendar']",
    ) as HTMLButtonElement | null;
    expect(accountButton).not.toBeNull();

    await act(async () => {
      accountButton?.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      );
      await Promise.resolve();
    });

    const options = Array.from(
      root.querySelectorAll(".roam-gtd-schedule-account-option"),
    ) as Array<HTMLButtonElement>;
    expect(options).toHaveLength(2);
    expect(document.activeElement).toBe(options[0]);

    await act(async () => {
      options[0]?.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      );
      await Promise.resolve();
    });

    expect(document.activeElement).toBe(options[1]);

    await act(async () => {
      options[1]?.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      );
      await Promise.resolve();
    });

    expect(root.querySelector(".roam-gtd-schedule-account-option")).toBeNull();
    expect(accountButton?.getAttribute("aria-expanded")).toBe("false");
  });
});
