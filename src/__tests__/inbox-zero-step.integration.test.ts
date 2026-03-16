import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  filterNamespacedPageOptions,
  formatDueDateTooltipLabel,
  formatNamespacedPageDisplayTitle,
  formatSchedulePopoverInitialValue,
  inferTriageCounterActionFromBlock,
  getNextStepOneTabStop,
  getStepOneTabOrder,
  resolveCounterActionFromSnapshot,
  resolveCounterActionFromSync,
  resolveProcessedSnapshot,
  shouldSuppressChildControlNavigation,
  submitProjectSelection,
  validateWebhookUrl,
  wireAgendaForTaggedPeople,
} from "../components/InboxZeroStep";
import { shouldRetainFocusedBlockEditor } from "../components/WeeklyReviewRoamBlock";
import type { PersonEntry } from "../people";
import type { TodoItem } from "../types";
import { TEST_SETTINGS } from "./fixtures";

const peopleMocks = vi.hoisted(() => ({
  createAgendaReference: vi.fn(async () => {}),
  createAgendaTodo: vi.fn(async () => {}),
  fetchAllPeople: vi.fn(async (): Promise<Array<PersonEntry>> => []),
  findPeopleInText: vi.fn((): Array<PersonEntry> => []),
  syncDelegatedAgendaEntry: vi.fn(async () => {}),
}));

vi.mock("../people", () => ({
  createAgendaReference: peopleMocks.createAgendaReference,
  createAgendaTodo: peopleMocks.createAgendaTodo,
  fetchAllPeople: peopleMocks.fetchAllPeople,
  findPeopleInText: peopleMocks.findPeopleInText,
  getOrCreatePersonPage: vi.fn(),
  pageHasTag: vi.fn(),
  sortPeopleEntries: (people: Array<PersonEntry>) => people,
  syncDelegatedAgendaEntry: peopleMocks.syncDelegatedAgendaEntry,
}));

const BASE_ITEM: TodoItem = {
  ageDays: 0,
  createdTime: 0,
  deferredDate: null,
  pageTitle: "Triage",
  text: "{{[[TODO]]}} item",
  uid: "todo-1",
};

interface MockElement {
  append: (...children: Array<MockElement>) => void;
  classList: { contains: (className: string) => boolean };
  closest: (selector: string) => MockElement | null;
  contains: (target: unknown) => boolean;
  getAttribute: (name: string) => string | null;
  isContentEditable: boolean;
  nodeType: number;
  tagName: string;
}

function createMockElement(
  options: {
    classes?: Array<string>;
    isContentEditable?: boolean;
    tagName?: string;
    uid?: string;
  } = {},
): MockElement {
  const classes = new Set(options.classes ?? []);
  const attributes = new Map<string, string>();
  if (options.uid) {
    attributes.set("data-uid", options.uid);
  }
  const children: Array<MockElement & { __parent: MockElement | null }> = [];
  const element: MockElement & {
    __matches: (selector: string) => boolean;
    __parent: MockElement | null;
  } = {
    __matches: (selector: string): boolean => {
      if (selector.startsWith(".")) {
        return classes.has(selector.slice(1));
      }
      if (selector === "[data-uid]") {
        return attributes.has("data-uid");
      }
      return false;
    },
    __parent: null,
    append: (...nextChildren: Array<MockElement>): void => {
      for (const child of nextChildren as Array<MockElement & { __parent: MockElement | null }>) {
        child.__parent = element;
        children.push(child);
      }
    },
    classList: {
      contains: (className: string): boolean => classes.has(className),
    },
    closest: (selector: string): MockElement | null => {
      const selectors = selector
        .split(",")
        .map((token) => token.trim())
        .filter(Boolean);
      let current:
        | (MockElement & { __matches: (s: string) => boolean; __parent: MockElement | null })
        | null = element;
      while (current) {
        if (selectors.some((token) => current!.__matches(token))) {
          return current;
        }
        current = current.__parent as
          | (MockElement & { __matches: (s: string) => boolean; __parent: MockElement | null })
          | null;
      }
      return null;
    },
    contains: (target: unknown): boolean => {
      if (target === element) {
        return true;
      }
      for (const child of children) {
        if (child.contains(target)) {
          return true;
        }
      }
      return false;
    },
    getAttribute: (name: string): string | null => attributes.get(name) ?? null,
    isContentEditable: options.isContentEditable ?? false,
    nodeType: 1,
    tagName: options.tagName ?? "DIV",
  };
  return element;
}

beforeEach(() => {
  const globalWithNode = globalThis as typeof globalThis & { Node?: typeof Node };
  if (!globalWithNode.Node) {
    globalWithNode.Node = { ELEMENT_NODE: 1 } as unknown as typeof Node;
  }
});

describe("Step 1 project submission routing", () => {
  it("routes namespaced new project input to creation flow", async () => {
    const removeTriageTagIfPresent = vi.fn(async () => "{{[[TODO]]}} item");
    const onCreateProjectFromInput = vi.fn(async () => undefined);
    const onTeleportToProject = vi.fn(async () => undefined);
    const onProjectHandled = vi.fn();

    const handled = await submitProjectSelection({
      blockString: "{{[[TODO]]}} item #[[Triage]]",
      currentItem: BASE_ITEM,
      onCreateProjectFromInput,
      onProjectHandled,
      onTeleportToProject,
      projectQuery: " [[ExampleCorp/My New Project]] ",
      removeTriageTagIfPresent,
      selectedProject: null,
    });

    expect(handled).toBe(true);
    expect(removeTriageTagIfPresent).toHaveBeenCalledWith(
      "todo-1",
      "{{[[TODO]]}} item #[[Triage]]",
    );
    expect(onCreateProjectFromInput).toHaveBeenCalledWith("todo-1", "[[ExampleCorp/My New Project]]");
    expect(onTeleportToProject).not.toHaveBeenCalled();
    expect(onProjectHandled).toHaveBeenCalledTimes(1);
  });

  it("routes selected project to teleport flow", async () => {
    const removeTriageTagIfPresent = vi.fn(async () => "{{[[TODO]]}} item");
    const onCreateProjectFromInput = vi.fn(async () => undefined);
    const onTeleportToProject = vi.fn(async () => undefined);
    const onProjectHandled = vi.fn();

    const handled = await submitProjectSelection({
      blockString: "{{[[TODO]]}} item #[[Triage]]",
      currentItem: BASE_ITEM,
      onCreateProjectFromInput,
      onProjectHandled,
      onTeleportToProject,
      projectQuery: "",
      removeTriageTagIfPresent,
      selectedProject: { uid: "project-uid" },
    });

    expect(handled).toBe(true);
    expect(removeTriageTagIfPresent).toHaveBeenCalledWith(
      "todo-1",
      "{{[[TODO]]}} item #[[Triage]]",
    );
    expect(onTeleportToProject).toHaveBeenCalledWith("todo-1", "project-uid");
    expect(onCreateProjectFromInput).not.toHaveBeenCalled();
    expect(onProjectHandled).toHaveBeenCalledTimes(1);
  });

  it("returns false and performs no project side effects when project input is empty", async () => {
    const removeTriageTagIfPresent = vi.fn(async () => "{{[[TODO]]}} item");
    const onCreateProjectFromInput = vi.fn(async () => undefined);
    const onTeleportToProject = vi.fn(async () => undefined);
    const onProjectHandled = vi.fn();

    const handled = await submitProjectSelection({
      blockString: "{{[[TODO]]}} item #[[Triage]]",
      currentItem: BASE_ITEM,
      onCreateProjectFromInput,
      onProjectHandled,
      onTeleportToProject,
      projectQuery: "   ",
      removeTriageTagIfPresent,
      selectedProject: null,
    });

    expect(handled).toBe(false);
    expect(removeTriageTagIfPresent).not.toHaveBeenCalled();
    expect(onTeleportToProject).not.toHaveBeenCalled();
    expect(onCreateProjectFromInput).not.toHaveBeenCalled();
    expect(onProjectHandled).not.toHaveBeenCalled();
  });
});

describe("Step 1 namespaced project display", () => {
  it("formats namespaced page titles to their alias segment", () => {
    expect(formatNamespacedPageDisplayTitle("Workspace/Alias")).toBe("Alias");
    expect(formatNamespacedPageDisplayTitle("Hello/Friendly Name")).toBe("Friendly Name");
    expect(formatNamespacedPageDisplayTitle("Standalone")).toBe("Standalone");
  });

  it("strips roam markup from project dropdown labels", () => {
    expect(
      formatNamespacedPageDisplayTitle(
        "Project:: Organize monthly [[Reports]] with [[Spreadsheets]] ([[work/Budget Tracker]])",
      ),
    ).toBe("Organize monthly Reports with Spreadsheets Budget Tracker");
    expect(formatNamespacedPageDisplayTitle("Project:: [[Roam GTD]] (wire up agents)")).toBe(
      "Roam GTD (wire up agents)",
    );
    expect(
      formatNamespacedPageDisplayTitle(
        "Project:: Scale [[Acme/Fulfillment]] to different locations",
      ),
    ).toBe("Scale Fulfillment to different locations");
    expect(
      formatNamespacedPageDisplayTitle(
        "Organize monthly Reports with Spreadsheets (work/Budget Tracker)",
      ),
    ).toBe("Organize monthly Reports with Spreadsheets Budget Tracker");
  });

  it("filters project options by either alias or full namespaced title", () => {
    const options = ["Workspace/Alias", "Reference Project", "Product/Vendor"];

    expect(filterNamespacedPageOptions(options, "alias")).toEqual(["Workspace/Alias"]);
    expect(filterNamespacedPageOptions(options, "workspace")).toEqual(["Workspace/Alias"]);
    expect(filterNamespacedPageOptions(options, "vendor")).toEqual(["Product/Vendor"]);
  });
});

describe("Step 1 counter action inference", () => {
  it("marks done when DONE/ARCHIVED status is present", () => {
    expect(inferTriageCounterActionFromBlock("{{[[TODO]]}} {{[[DONE]]}}", TEST_SETTINGS)).toBe(
      "done",
    );
    expect(inferTriageCounterActionFromBlock("{{DONE}} cleaned up", TEST_SETTINGS)).toBe("done");
    expect(inferTriageCounterActionFromBlock("{{ archived }} cleaned up", TEST_SETTINGS)).toBe(
      "done",
    );
    expect(inferTriageCounterActionFromBlock("DONE cleaned up", TEST_SETTINGS)).toBe("done");
  });

  it("maps workflow tags to up/delegate/watch/someday colors", () => {
    expect(inferTriageCounterActionFromBlock("{{[[TODO]]}} #up", TEST_SETTINGS)).toBe("up");
    expect(inferTriageCounterActionFromBlock("{{[[TODO]]}} #delegated", TEST_SETTINGS)).toBe(
      "delegate",
    );
    expect(inferTriageCounterActionFromBlock("{{[[TODO]]}} #watch", TEST_SETTINGS)).toBe("watch");
    expect(inferTriageCounterActionFromBlock("{{[[TODO]]}} #someday", TEST_SETTINGS)).toBe(
      "someday",
    );
  });

  it("uses workflow precedence when multiple triage tags are present", () => {
    expect(inferTriageCounterActionFromBlock("{{[[TODO]]}} #watch #delegated", TEST_SETTINGS)).toBe(
      "delegate",
    );
    expect(
      inferTriageCounterActionFromBlock(
        "{{[[TODO]]}} #someday #watch #delegated #up",
        TEST_SETTINGS,
      ),
    ).toBe("up");
  });

  it("infers reference when the block no longer has a TODO marker or workflow tag", () => {
    expect(inferTriageCounterActionFromBlock("plain reference item", TEST_SETTINGS)).toBe(
      "reference",
    );
    expect(inferTriageCounterActionFromBlock("((other-uid))", TEST_SETTINGS)).toBe("reference");
  });

  it("does not let reference override a remaining workflow tag", () => {
    expect(inferTriageCounterActionFromBlock("#someday plain item", TEST_SETTINGS)).toBe("someday");
  });

  it("returns null when no recognized triage action marker is present", () => {
    expect(inferTriageCounterActionFromBlock("{{[[TODO]]}} plain item", TEST_SETTINGS)).toBeNull();
  });
});

describe("Step 1 counter action sync resolution", () => {
  it("preserves reference when sync cannot infer a durable marker", () => {
    expect(resolveCounterActionFromSync("reference", null)).toBe("reference");
  });

  it("clears non-reference action when sync infers null", () => {
    expect(resolveCounterActionFromSync("watch", null)).toBeNull();
  });

  it("prefers inferred action when available", () => {
    expect(resolveCounterActionFromSync("reference", "watch")).toBe("watch");
  });
});

describe("Step 1 counter action snapshot resolution", () => {
  it("preserves reference when snapshot text has no durable marker", () => {
    expect(
      resolveCounterActionFromSnapshot("reference", "{{[[TODO]]}} plain item", TEST_SETTINGS),
    ).toBe("reference");
    expect(resolveCounterActionFromSnapshot("reference", "plain item", TEST_SETTINGS)).toBe(
      "reference",
    );
  });

  it("uses inferred marker when snapshot text includes one", () => {
    expect(
      resolveCounterActionFromSnapshot("reference", "{{[[TODO]]}} #watch", TEST_SETTINGS),
    ).toBe("watch");
  });
});

describe("Step 1 keyboard tab order", () => {
  it("cycles context -> calendar -> delegate -> project", () => {
    expect(getStepOneTabOrder()).toEqual(["context", "calendar", "delegate", "project"]);
  });

  it("wraps forward and backward across the four-field cycle", () => {
    expect(getNextStepOneTabStop("context")).toBe("calendar");
    expect(getNextStepOneTabStop("calendar")).toBe("delegate");
    expect(getNextStepOneTabStop("delegate")).toBe("project");
    expect(getNextStepOneTabStop("project")).toBe("context");
    expect(getNextStepOneTabStop("context", true)).toBe("project");
    expect(getNextStepOneTabStop("project", true)).toBe("delegate");
  });

  it("never routes tabbing to process/next/back controls", () => {
    expect(getNextStepOneTabStop("process")).toBe("context");
    expect(getNextStepOneTabStop("next")).toBe("context");
    expect(getNextStepOneTabStop("back")).toBe("context");
  });
});

describe("Step 1 child block suppression", () => {
  it("suppresses clicks anywhere inside descendant blocks but not the root block", () => {
    const container = createMockElement();
    const rootBlock = createMockElement({ uid: "root-uid" });
    const rootBullet = createMockElement({ classes: ["rm-bullet"] });
    const rootText = createMockElement({ classes: ["rm-block__input"] });
    rootBlock.append(rootBullet, rootText);
    const childBlock = createMockElement({ uid: "child-uid" });
    const childBullet = createMockElement({ classes: ["rm-bullet"] });
    const childText = createMockElement({ classes: ["rm-block__input"] });
    childBlock.append(childBullet, childText);
    container.append(rootBlock, childBlock);

    expect(
      shouldSuppressChildControlNavigation({
        container: container as unknown as HTMLElement,
        rootUid: "root-uid",
        target: childBullet as unknown as EventTarget,
      }),
    ).toBe(true);
    expect(
      shouldSuppressChildControlNavigation({
        container: container as unknown as HTMLElement,
        rootUid: "root-uid",
        target: childText as unknown as EventTarget,
      }),
    ).toBe(true);
    expect(
      shouldSuppressChildControlNavigation({
        container: container as unknown as HTMLElement,
        rootUid: "root-uid",
        target: rootBullet as unknown as EventTarget,
      }),
    ).toBe(false);
    expect(
      shouldSuppressChildControlNavigation({
        container: container as unknown as HTMLElement,
        rootUid: "root-uid",
        target: rootText as unknown as EventTarget,
      }),
    ).toBe(false);
  });

  it("allows descendant block interaction when suppression is disabled", () => {
    const container = createMockElement();
    const rootBlock = createMockElement({ uid: "root-uid" });
    const childBlock = createMockElement({ uid: "child-uid" });
    const childText = createMockElement({ classes: ["rm-block__input"] });
    childBlock.append(childText);
    container.append(rootBlock, childBlock);

    expect(
      shouldSuppressChildControlNavigation({
        container: container as unknown as HTMLElement,
        rootUid: "root-uid",
        suppressChildControlNavigation: false,
        target: childText as unknown as EventTarget,
      } as Parameters<typeof shouldSuppressChildControlNavigation>[0]),
    ).toBe(false);
  });

  it("does not suppress outside targets", () => {
    const container = createMockElement();
    const childBlock = createMockElement({ uid: "child-uid" });
    const childText = createMockElement({ classes: ["rm-block__input"] });
    childBlock.append(childText);
    container.append(childBlock);
    const outsideBullet = createMockElement({ classes: ["rm-bullet"] });

    expect(
      shouldSuppressChildControlNavigation({
        container: container as unknown as HTMLElement,
        rootUid: "root-uid",
        target: outsideBullet as unknown as EventTarget,
      }),
    ).toBe(false);
  });
});

describe("weekly review block focus retention", () => {
  it("retains focus only for an editor inside the requested container", () => {
    const container = createMockElement();
    const localEditor = createMockElement({ classes: ["rm-block__input"] });
    const outsideContainer = createMockElement();
    const outsideEditor = createMockElement({ classes: ["rm-block__input"] });
    container.append(localEditor);
    outsideContainer.append(outsideEditor);

    expect(
      shouldRetainFocusedBlockEditor({
        activeElement: localEditor as unknown as Element,
        container: container as unknown as HTMLElement,
      }),
    ).toBe(true);
    expect(
      shouldRetainFocusedBlockEditor({
        activeElement: outsideEditor as unknown as Element,
        container: container as unknown as HTMLElement,
      }),
    ).toBe(false);
  });
});

describe("Processed snapshot resolution", () => {
  const now = Date.UTC(2026, 1, 28, 12, 0, 0);
  const item = {
    ageDays: 1,
    createdTime: now - 1000,
    deferredDate: null,
    pageTitle: "Inbox",
    text: "{{[[TODO]]}} item",
    uid: "uid-1",
  };

  it("prefers the live items list when uid is present", () => {
    const snapshot = resolveProcessedSnapshot("uid-1", [item], null, "fallback", now);
    expect(snapshot).toEqual(item);
    expect(snapshot).not.toBe(item);
  });

  it("falls back to the currently-viewed item when live list already changed", () => {
    const snapshot = resolveProcessedSnapshot("uid-1", [], item, "fallback", now);
    expect(snapshot).toEqual(item);
    expect(snapshot).not.toBe(item);
  });

  it("creates a minimal snapshot when neither source still has the uid", () => {
    const snapshot = resolveProcessedSnapshot("uid-1", [], null, "fallback", now);
    expect(snapshot).toEqual({
      ageDays: 0,
      createdTime: now,
      deferredDate: null,
      pageTitle: "",
      text: "fallback",
      uid: "uid-1",
    });
  });
});

describe("Webhook URL validation", () => {
  it("accepts valid https URLs", () => {
    expect(validateWebhookUrl("https://example.com/webhook")).toBeNull();
  });

  it("accepts valid http URLs", () => {
    expect(validateWebhookUrl("http://localhost:3000/webhook")).toBeNull();
  });

  it("rejects malformed URLs", () => {
    expect(validateWebhookUrl("not-a-url")).toBe("Webhook URL is not a valid URL.");
    expect(validateWebhookUrl("://missing-scheme")).toBe("Webhook URL is not a valid URL.");
  });

  it("rejects non-http(s) protocols", () => {
    expect(validateWebhookUrl("ftp://example.com")).toBe(
      "Webhook URL must use http:// or https://.",
    );
    expect(validateWebhookUrl("javascript:alert(1)")).toBe(
      "Webhook URL must use http:// or https://.",
    );
    expect(validateWebhookUrl("file:///etc/passwd")).toBe(
      "Webhook URL must use http:// or https://.",
    );
  });
});

describe("wireAgendaForTaggedPeople", () => {
  beforeEach(() => {
    peopleMocks.createAgendaReference.mockClear();
    peopleMocks.createAgendaTodo.mockClear();
    peopleMocks.fetchAllPeople.mockClear();
    peopleMocks.findPeopleInText.mockClear();
  });

  it("calls createAgendaTodo (block ref) when hasDueDate is true", async () => {
    const people = [{ lastInteractionTime: 0, title: "Sam Taylor", uid: "uid-s" }];
    peopleMocks.findPeopleInText.mockReturnValue([people[0]]);

    await wireAgendaForTaggedPeople({
      blockText: "remind [[Sam Taylor]] about X",
      blockUid: "block-1",
      delegateTargetTags: ["people"],
      hasDueDate: true,
      people,
    });

    expect(peopleMocks.createAgendaTodo).toHaveBeenCalledWith("block-1", "Sam Taylor");
    expect(peopleMocks.createAgendaReference).not.toHaveBeenCalled();
    expect(peopleMocks.fetchAllPeople).not.toHaveBeenCalled();
  });

  it("calls createAgendaReference (block ref) when hasDueDate is false", async () => {
    const people = [{ lastInteractionTime: 0, title: "Sam Taylor", uid: "uid-s" }];
    peopleMocks.findPeopleInText.mockReturnValue([people[0]]);

    await wireAgendaForTaggedPeople({
      blockText: "remind [[Sam Taylor]] about X",
      blockUid: "block-1",
      delegateTargetTags: ["people"],
      hasDueDate: false,
      people,
    });

    expect(peopleMocks.createAgendaReference).toHaveBeenCalledWith("block-1", "Sam Taylor");
    expect(peopleMocks.createAgendaTodo).not.toHaveBeenCalled();
  });

  it("fetches people when passed empty array", async () => {
    const fetched = [{ lastInteractionTime: 0, title: "Alice", uid: "uid-a" }];
    peopleMocks.fetchAllPeople.mockResolvedValue(fetched);
    peopleMocks.findPeopleInText.mockReturnValue([fetched[0]]);

    await wireAgendaForTaggedPeople({
      blockText: "ask [[Alice]]",
      blockUid: "block-1",
      delegateTargetTags: ["people", "agents"],
      hasDueDate: false,
      people: [],
    });

    expect(peopleMocks.fetchAllPeople).toHaveBeenCalledWith(["people", "agents"]);
    expect(peopleMocks.createAgendaReference).toHaveBeenCalledWith("block-1", "Alice");
  });

  it("wires context-selected people even when the main block text has no person tag", async () => {
    const people = [{ lastInteractionTime: 0, title: "Jane Cooper", uid: "uid-m" }];
    peopleMocks.findPeopleInText.mockReturnValue([]);

    await wireAgendaForTaggedPeople({
      additionalTitles: ["Jane Cooper"],
      blockText: "{{[[TODO]]}} tell someone to buy a pizza #up",
      blockUid: "block-1",
      delegateTargetTags: ["people"],
      hasDueDate: false,
      people,
    });

    expect(peopleMocks.createAgendaReference).toHaveBeenCalledTimes(1);
    expect(peopleMocks.createAgendaReference).toHaveBeenCalledWith("block-1", "Jane Cooper");
  });

  it("dedupes the same person when they appear in the block text and Context", async () => {
    const jane = { lastInteractionTime: 0, title: "Jane Cooper", uid: "uid-m" };
    peopleMocks.findPeopleInText.mockReturnValue([jane]);

    await wireAgendaForTaggedPeople({
      additionalTitles: ["[[Jane Cooper]]", "#[[Jane Cooper]]"],
      blockText: "{{[[TODO]]}} Tell [[Jane Cooper]] to buy a pizza #up",
      blockUid: "block-1",
      delegateTargetTags: ["people"],
      hasDueDate: false,
      people: [jane],
    });

    expect(peopleMocks.createAgendaReference).toHaveBeenCalledTimes(1);
    expect(peopleMocks.createAgendaReference).toHaveBeenCalledWith("block-1", "Jane Cooper");
  });

  it("skips explicitly excluded people while still wiring others from Context", async () => {
    const jane = { lastInteractionTime: 0, title: "Jane Cooper", uid: "uid-m" };
    const greg = { lastInteractionTime: 0, title: "Greg Wilson", uid: "uid-g" };
    peopleMocks.findPeopleInText.mockReturnValue([jane]);

    await wireAgendaForTaggedPeople({
      additionalTitles: ["Greg Wilson"],
      blockText: "{{[[TODO]]}} Tell [[Jane Cooper]] to buy a pizza #up",
      blockUid: "block-1",
      delegateTargetTags: ["people"],
      excludeTitles: ["Jane Cooper"],
      hasDueDate: false,
      people: [jane, greg],
    });

    expect(peopleMocks.createAgendaReference).toHaveBeenCalledTimes(1);
    expect(peopleMocks.createAgendaReference).toHaveBeenCalledWith("block-1", "Greg Wilson");
  });

  it("returns silently when fetchAllPeople throws", async () => {
    peopleMocks.fetchAllPeople.mockRejectedValue(new Error("network"));

    await wireAgendaForTaggedPeople({
      blockText: "ask [[Alice]]",
      blockUid: "block-1",
      delegateTargetTags: ["people"],
      hasDueDate: false,
      people: [],
    });

    expect(peopleMocks.createAgendaReference).not.toHaveBeenCalled();
    expect(peopleMocks.createAgendaTodo).not.toHaveBeenCalled();
  });

  it("continues wiring remaining people when one agenda call fails", async () => {
    const people = [
      { lastInteractionTime: 0, title: "Alice", uid: "uid-a" },
      { lastInteractionTime: 0, title: "Bob", uid: "uid-b" },
    ];
    peopleMocks.findPeopleInText.mockReturnValue(people);
    peopleMocks.createAgendaReference
      .mockRejectedValueOnce(new Error("fail Alice"))
      .mockResolvedValueOnce(undefined);

    await wireAgendaForTaggedPeople({
      blockText: "ask [[Alice]] and [[Bob]]",
      blockUid: "block-1",
      delegateTargetTags: ["people"],
      hasDueDate: false,
      people,
    });

    expect(peopleMocks.createAgendaReference).toHaveBeenCalledTimes(2);
    expect(peopleMocks.createAgendaReference).toHaveBeenCalledWith("block-1", "Alice");
    expect(peopleMocks.createAgendaReference).toHaveBeenCalledWith("block-1", "Bob");
  });

  it("does nothing when no people are found in text", async () => {
    peopleMocks.findPeopleInText.mockReturnValue([]);

    await wireAgendaForTaggedPeople({
      blockText: "just a plain task",
      blockUid: "block-1",
      delegateTargetTags: ["people"],
      hasDueDate: true,
      people: [{ lastInteractionTime: 0, title: "Alice", uid: "uid-a" }],
    });

    expect(peopleMocks.createAgendaTodo).not.toHaveBeenCalled();
    expect(peopleMocks.createAgendaReference).not.toHaveBeenCalled();
  });
});

describe("formatDueDateTooltipLabel", () => {
  it("returns null when no due date exists", () => {
    expect(formatDueDateTooltipLabel(undefined, "")).toBeNull();
  });

  it("returns the persisted roam date when only a date is scheduled", () => {
    expect(formatDueDateTooltipLabel(undefined, "March 26th, 2026")).toBe("March 26th, 2026");
  });

  it("formats a scheduled time inline with the roam date", () => {
    expect(
      formatDueDateTooltipLabel(
        {
          date: new Date("2026-03-26T15:00:00"),
          roamDate: "March 26th, 2026",
          time: "15:00",
        },
        "",
      ),
    ).toBe("March 26th, 2026 at 3:00 PM");
  });
});

describe("formatSchedulePopoverInitialValue", () => {
  it("returns the persisted roam date when there is no in-memory schedule intent", () => {
    expect(formatSchedulePopoverInitialValue(undefined, "March 26th, 2026")).toBe(
      "March 26th, 2026",
    );
  });

  it("includes the scheduled time when reopening an in-memory timed intent", () => {
    expect(
      formatSchedulePopoverInitialValue(
        {
          date: new Date("2026-03-26T15:00:00"),
          roamDate: "March 26th, 2026",
          time: "15:00",
        },
        "March 26th, 2026",
      ),
    ).toBe("March 26th, 2026 at 3:00 PM");
  });
});
