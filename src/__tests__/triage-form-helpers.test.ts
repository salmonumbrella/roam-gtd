import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CALENDAR_BUTTON_ID,
  CONTEXT_AUTOCOMPLETE_ID,
  DELEGATE_AUTOCOMPLETE_ID,
  PROJECT_AUTOCOMPLETE_ID,
  acceptAutocompleteSelectionOnTab,
  focusTriageTabStop,
  formatDueDateTooltipLabel,
  formatSchedulePopoverInitialValue,
  getEnabledTriageTabOrder,
  getNextTriageTabStop,
  getTriageTabOrder,
  isAutocompleteFieldElement,
  resolveAutocompleteContextTabStop,
} from "../triage/form-helpers";

type MockRect = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

type MockElementOptions = {
  childElementCount?: number;
  classes?: Array<string>;
  disabled?: boolean;
  display?: string;
  id?: string;
  rect?: MockRect;
  textContent?: string;
  visibility?: string;
};

class MockElement {
  childElementCount = 0;
  children: Array<MockElement> = [];
  disabled = false;
  display = "block";
  id = "";
  nodeType = 1;
  parent: MockElement | null = null;
  rect: MockRect = { bottom: 40, left: 0, right: 120, top: 0 };
  style = {};
  tagName: string;
  textContent = "";
  visibility = "visible";

  readonly classes = new Set<string>();
  readonly dispatchEvent = vi.fn<(event: unknown) => boolean>(() => true);
  readonly focus = vi.fn<() => void>();

  constructor(tagName: string, options: MockElementOptions = {}) {
    this.tagName = tagName.toUpperCase();
    const { classes, ...rest } = options;
    Object.assign(this, rest);
    for (const className of classes ?? []) {
      this.classes.add(className);
    }
  }

  append(...children: Array<MockElement>): void {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
    this.childElementCount = this.children.length;
  }

  closest(selector: string): MockElement | null {
    let current: MockElement | null = this;
    while (current) {
      if (current.matches(selector)) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  contains(target: unknown): boolean {
    if (target === this) {
      return true;
    }
    return this.children.some((child) => child.contains(target));
  }

  getBoundingClientRect(): DOMRect {
    return this.rect as DOMRect;
  }

  getClientRects(): Array<DOMRect> {
    return this.display === "none" || this.visibility === "hidden" ? [] : ([{}] as Array<DOMRect>);
  }

  matches(selector: string): boolean {
    if (selector.startsWith(".")) {
      return this.classes.has(selector.slice(1));
    }
    return false;
  }

  querySelector<T extends MockElement>(selector: string): T | null {
    for (const child of this.children) {
      if (child.matches(selector)) {
        return child as T;
      }
      const nested = child.querySelector<T>(selector);
      if (nested) {
        return nested;
      }
    }
    return null;
  }
}

class MockDocument {
  readonly elementsById = new Map<string, MockElement>();
  autocompleteContainers: Array<MockElement> = [];

  getElementById(id: string): MockElement | null {
    return this.elementsById.get(id) ?? null;
  }

  querySelectorAll<T extends MockElement>(_selector: string): Array<T> {
    return this.autocompleteContainers as Array<T>;
  }

  register(...elements: Array<MockElement>): void {
    for (const element of elements) {
      if (element.id) {
        this.elementsById.set(element.id, element);
      }
    }
  }
}

class MockKeyboardEvent {
  bubbles: boolean;
  cancelable: boolean;
  code: string;
  key: string;

  constructor(
    _type: string,
    init: { bubbles: boolean; cancelable: boolean; code: string; key: string },
  ) {
    this.bubbles = init.bubbles;
    this.cancelable = init.cancelable;
    this.code = init.code;
    this.key = init.key;
  }
}

function createInput(
  id: string,
  options: MockElementOptions & { value?: string } = {},
): MockElement & { value: string } {
  return Object.assign(
    new MockElement("input", {
      id,
      rect: options.rect ?? { bottom: 40, left: 0, right: 120, top: 0 },
      ...options,
    }),
    { value: options.value ?? "" },
  );
}

function setupDom() {
  const document = new MockDocument();
  const window = {
    getComputedStyle: (element: MockElement) => ({
      display: element.display,
      visibility: element.visibility,
    }),
  };

  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  vi.stubGlobal("Node", { ELEMENT_NODE: 1 });
  vi.stubGlobal("KeyboardEvent", MockKeyboardEvent);

  return { document };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("triage tab order", () => {
  it("returns the expected tab order and wraps forward/backward", () => {
    expect(getTriageTabOrder()).toEqual(["context", "calendar", "delegate", "project"]);
    expect(getNextTriageTabStop(null)).toBe("context");
    expect(getNextTriageTabStop("project")).toBe("context");
    expect(getNextTriageTabStop("context", true)).toBe("project");
    expect(getNextTriageTabStop("delegate", true)).toBe("calendar");
    expect(getNextTriageTabStop(null, false, [])).toBeNull();
  });
});

describe("triage enabled controls", () => {
  it("returns only visible enabled tab stops and focuses them", () => {
    const { document } = setupDom();
    const context = createInput(CONTEXT_AUTOCOMPLETE_ID);
    const calendar = new MockElement("button", { disabled: true, id: CALENDAR_BUTTON_ID });
    const delegate = createInput(DELEGATE_AUTOCOMPLETE_ID, { display: "none" });
    const project = createInput(PROJECT_AUTOCOMPLETE_ID);

    document.register(context, calendar, delegate, project);

    expect(getEnabledTriageTabOrder()).toEqual(["context", "project"]);
    expect(focusTriageTabStop("context")).toBe(true);
    expect(context.focus).toHaveBeenCalledTimes(1);
    expect(focusTriageTabStop("calendar")).toBe(false);
  });

  it("recognizes autocomplete input elements by id", () => {
    const context = createInput(CONTEXT_AUTOCOMPLETE_ID);
    const other = createInput("not-triage");
    const nonInput = new MockElement("div", { id: CONTEXT_AUTOCOMPLETE_ID });

    expect(isAutocompleteFieldElement(context as unknown as Element)).toBe(true);
    expect(isAutocompleteFieldElement(other as unknown as Element)).toBe(false);
    expect(isAutocompleteFieldElement(nonInput as unknown as Element)).toBe(false);
  });
});

describe("autocomplete tab acceptance", () => {
  it("dispatches Enter when the active autocomplete field has value and visible results", () => {
    const { document } = setupDom();
    const wrapper = new MockElement("div", { classes: ["rm-autocomplete__wrapper"] });
    const results = new MockElement("div", { classes: ["rm-autocomplete__results"] });
    const option = new MockElement("button");
    const context = createInput(CONTEXT_AUTOCOMPLETE_ID, { value: "Home" });

    results.append(option);
    wrapper.append(context, results);
    document.register(context);
    document.autocompleteContainers = [results];

    expect(acceptAutocompleteSelectionOnTab("context")).toBe(true);
    expect(context.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(context.dispatchEvent.mock.calls[0]?.[0]).toMatchObject({
      bubbles: true,
      cancelable: true,
      code: "Enter",
      key: "Enter",
    });
  });

  it("returns false when there is no input value or no result container", () => {
    const { document } = setupDom();
    const context = createInput(CONTEXT_AUTOCOMPLETE_ID, { value: "   " });

    document.register(context);

    expect(acceptAutocompleteSelectionOnTab("context")).toBe(false);
    expect(context.dispatchEvent).not.toHaveBeenCalled();
    expect(acceptAutocompleteSelectionOnTab("calendar")).toBe(false);
  });
});

describe("autocomplete context resolution", () => {
  it("resolves tab stops from inputs, wrappers, result menus, and calendar button", () => {
    const { document } = setupDom();
    const contextWrapper = new MockElement("div", { classes: ["rm-autocomplete__wrapper"] });
    const contextResults = new MockElement("div", {
      childElementCount: 1,
      classes: ["rm-autocomplete__results"],
      rect: { bottom: 92, left: 0, right: 120, top: 44 },
    });
    const contextInput = createInput(CONTEXT_AUTOCOMPLETE_ID, {
      rect: { bottom: 40, left: 0, right: 120, top: 0 },
    });
    const contextOption = new MockElement("button");
    const calendar = new MockElement("button", { id: CALENDAR_BUTTON_ID });
    const delegateInput = createInput(DELEGATE_AUTOCOMPLETE_ID, {
      rect: { bottom: 40, left: 140, right: 260, top: 0 },
    });
    const projectInput = createInput(PROJECT_AUTOCOMPLETE_ID);

    contextResults.append(contextOption);
    contextWrapper.append(contextInput, contextResults);
    document.register(contextInput, calendar, delegateInput, projectInput);
    document.autocompleteContainers = [contextResults];

    expect(resolveAutocompleteContextTabStop(contextInput as unknown as HTMLElement)).toBe(
      "context",
    );
    expect(resolveAutocompleteContextTabStop(contextWrapper as unknown as HTMLElement)).toBe(
      "context",
    );
    expect(resolveAutocompleteContextTabStop(contextOption as unknown as HTMLElement)).toBe(
      "context",
    );
    expect(resolveAutocompleteContextTabStop(calendar as unknown as HTMLElement)).toBe("calendar");
    expect(
      resolveAutocompleteContextTabStop(new MockElement("div") as unknown as HTMLElement),
    ).toBeNull();
  });
});

describe("due-date labels", () => {
  it("formats schedule tooltip labels and initial values from intent or persisted dates", () => {
    const date = new Date(2026, 1, 26, 14, 5);

    expect(
      formatDueDateTooltipLabel(
        { date, roamDate: "February 26th, 2026", time: "2:05 PM" },
        "February 20th, 2026",
      ),
    ).toBe("February 26th, 2026 at 2:05 PM");
    expect(
      formatSchedulePopoverInitialValue(
        { date, roamDate: "", time: "2:05 PM" },
        "February 20th, 2026",
      ),
    ).toBe("February 26th, 2026 at 2:05 PM");
    expect(formatDueDateTooltipLabel(undefined, "  February 20th, 2026  ")).toBe(
      "February 20th, 2026",
    );
    expect(formatSchedulePopoverInitialValue(undefined, "  February 20th, 2026  ")).toBe(
      "February 20th, 2026",
    );
    expect(formatDueDateTooltipLabel(undefined, "   ")).toBeNull();
  });
});
