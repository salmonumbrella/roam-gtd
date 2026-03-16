import { describe, expect, it } from "vitest";

import {
  getInboxZeroDueDateRemapKey,
  resolveInboxZeroAutocompleteEscapeCommand,
  resolveInboxZeroShortcutCommand,
  resolveInboxZeroTabCommand,
} from "../inbox-zero/hotkeys";

describe("inbox zero hotkeys", () => {
  it("resolves Step 1 shortcut actions without leaking mutation details", () => {
    expect(
      resolveInboxZeroShortcutCommand({
        action: "delegate",
        currentItemUid: "todo-1",
        showDelegatePrompt: false,
      }),
    ).toEqual({
      type: "openDelegatePrompt",
      uid: "todo-1",
    });

    expect(
      resolveInboxZeroShortcutCommand({
        action: "up",
        currentItemUid: "todo-1",
        showDelegatePrompt: false,
      }),
    ).toEqual({
      action: "up",
      type: "workflowAction",
      uid: "todo-1",
    });

    expect(
      resolveInboxZeroShortcutCommand({
        action: "watch",
        currentItemUid: "todo-1",
        showDelegatePrompt: false,
      }),
    ).toEqual({
      action: "watch",
      type: "workflowAction",
      uid: "todo-1",
    });

    expect(
      resolveInboxZeroShortcutCommand({
        action: "someday",
        currentItemUid: "todo-1",
        showDelegatePrompt: false,
      }),
    ).toEqual({
      action: "someday",
      type: "workflowAction",
      uid: "todo-1",
    });

    expect(
      resolveInboxZeroShortcutCommand({
        action: "reference",
        currentItemUid: "todo-1",
        showDelegatePrompt: false,
      }),
    ).toEqual({
      action: "reference",
      type: "workflowAction",
      uid: "todo-1",
    });

    expect(
      resolveInboxZeroShortcutCommand({
        action: "done",
        currentItemUid: "todo-1",
        showDelegatePrompt: false,
      }),
    ).toEqual({
      action: "done",
      type: "workflowAction",
      uid: "todo-1",
    });

    expect(
      resolveInboxZeroShortcutCommand({
        action: "focus",
        currentItemUid: "todo-1",
        showDelegatePrompt: false,
      }),
    ).toEqual({ type: "focusBlock" });

    expect(
      resolveInboxZeroShortcutCommand({
        action: "focus",
        currentItemUid: "todo-1",
        showDelegatePrompt: true,
      }),
    ).toEqual({ type: "handledNoop" });

    expect(
      resolveInboxZeroShortcutCommand({
        action: "project",
        currentItemUid: "todo-1",
        showDelegatePrompt: false,
      }),
    ).toEqual({ type: "focusProject" });

    expect(
      resolveInboxZeroShortcutCommand({
        action: "submit",
        currentItemUid: null,
        showDelegatePrompt: false,
      }),
    ).toEqual({ type: "submit" });
  });

  it("resolves Tab-cycle decisions across Step 1 controls", () => {
    expect(
      resolveInboxZeroTabCommand({
        activeInsideDialog: true,
        activeStop: "context",
        altKey: false,
        ctrlKey: false,
        enabledTabOrder: ["context", "calendar", "delegate", "project"],
        isBlockEditor: false,
        isForeignTextEntry: false,
        isInsideSchedulePopover: false,
        key: "Tab",
        lastTabStop: null,
        metaKey: false,
        selectedEmbedOwnsTab: false,
        shiftKey: false,
        showDelegatePrompt: false,
      }),
    ).toEqual({
      acceptAutocompleteSelection: true,
      clearRememberedStop: false,
      currentStop: "context",
      targetStop: "calendar",
      type: "focusStop",
    });

    expect(
      resolveInboxZeroTabCommand({
        activeInsideDialog: true,
        activeStop: "context",
        altKey: false,
        ctrlKey: false,
        enabledTabOrder: ["context", "calendar", "delegate", "project"],
        isBlockEditor: false,
        isForeignTextEntry: false,
        isInsideSchedulePopover: false,
        key: "Tab",
        lastTabStop: null,
        metaKey: false,
        selectedEmbedOwnsTab: false,
        shiftKey: true,
        showDelegatePrompt: false,
      }),
    ).toEqual({
      acceptAutocompleteSelection: false,
      clearRememberedStop: false,
      currentStop: "context",
      targetStop: "project",
      type: "focusStop",
    });

    expect(
      resolveInboxZeroTabCommand({
        activeInsideDialog: true,
        activeStop: null,
        altKey: false,
        ctrlKey: false,
        enabledTabOrder: ["context", "calendar", "delegate", "project"],
        isBlockEditor: false,
        isForeignTextEntry: false,
        isInsideSchedulePopover: false,
        key: "Tab",
        lastTabStop: "calendar",
        metaKey: false,
        selectedEmbedOwnsTab: false,
        shiftKey: false,
        showDelegatePrompt: false,
      }),
    ).toEqual({
      acceptAutocompleteSelection: true,
      clearRememberedStop: true,
      currentStop: "calendar",
      targetStop: "delegate",
      type: "focusStop",
    });
  });

  it("stays inert when Tab should be owned by another interaction", () => {
    expect(
      resolveInboxZeroTabCommand({
        activeInsideDialog: true,
        activeStop: "context",
        altKey: false,
        ctrlKey: false,
        enabledTabOrder: ["context", "calendar", "delegate", "project"],
        isBlockEditor: false,
        isForeignTextEntry: false,
        isInsideSchedulePopover: false,
        key: "Tab",
        lastTabStop: null,
        metaKey: false,
        selectedEmbedOwnsTab: false,
        shiftKey: false,
        showDelegatePrompt: true,
      }),
    ).toEqual({ type: "noop" });

    expect(
      resolveInboxZeroTabCommand({
        activeInsideDialog: true,
        activeStop: "context",
        altKey: false,
        ctrlKey: false,
        enabledTabOrder: ["context", "calendar", "delegate", "project"],
        isBlockEditor: false,
        isForeignTextEntry: false,
        isInsideSchedulePopover: true,
        key: "Tab",
        lastTabStop: null,
        metaKey: false,
        selectedEmbedOwnsTab: false,
        shiftKey: false,
        showDelegatePrompt: false,
      }),
    ).toEqual({ type: "noop" });

    expect(
      resolveInboxZeroTabCommand({
        activeInsideDialog: false,
        activeStop: null,
        altKey: false,
        ctrlKey: false,
        enabledTabOrder: ["context", "calendar", "delegate", "project"],
        isBlockEditor: false,
        isForeignTextEntry: true,
        isInsideSchedulePopover: false,
        key: "Tab",
        lastTabStop: null,
        metaKey: false,
        selectedEmbedOwnsTab: false,
        shiftKey: false,
        showDelegatePrompt: false,
      }),
    ).toEqual({ type: "noop" });

    expect(
      resolveInboxZeroTabCommand({
        activeInsideDialog: true,
        activeStop: "context",
        altKey: false,
        ctrlKey: false,
        enabledTabOrder: ["context", "calendar", "delegate", "project"],
        isBlockEditor: true,
        isForeignTextEntry: false,
        isInsideSchedulePopover: false,
        key: "Tab",
        lastTabStop: null,
        metaKey: false,
        selectedEmbedOwnsTab: false,
        shiftKey: false,
        showDelegatePrompt: false,
      }),
    ).toEqual({ type: "noop" });

    expect(
      resolveInboxZeroTabCommand({
        activeInsideDialog: true,
        activeStop: "context",
        altKey: false,
        ctrlKey: false,
        enabledTabOrder: ["context", "calendar", "delegate", "project"],
        isBlockEditor: false,
        isForeignTextEntry: false,
        isInsideSchedulePopover: false,
        key: "Tab",
        lastTabStop: null,
        metaKey: false,
        selectedEmbedOwnsTab: true,
        shiftKey: false,
        showDelegatePrompt: false,
      }),
    ).toEqual({ type: "noop" });
  });

  it("allows Tab to keep moving through right-side controls when the embed is highlighted but does not own focus", () => {
    expect(
      resolveInboxZeroTabCommand({
        activeInsideDialog: true,
        activeStop: "calendar",
        altKey: false,
        ctrlKey: false,
        enabledTabOrder: ["context", "calendar", "delegate", "project"],
        isBlockEditor: false,
        isForeignTextEntry: false,
        isInsideSchedulePopover: false,
        key: "Tab",
        lastTabStop: null,
        metaKey: false,
        selectedEmbedOwnsTab: false,
        shiftKey: false,
        showDelegatePrompt: false,
      }),
    ).toEqual({
      acceptAutocompleteSelection: true,
      clearRememberedStop: false,
      currentStop: "calendar",
      targetStop: "delegate",
      type: "focusStop",
    });
  });

  it("resolves autocomplete Escape handling", () => {
    expect(
      resolveInboxZeroAutocompleteEscapeCommand({
        activeStop: "delegate",
        isAutocompleteField: true,
        isTrusted: true,
        key: "Escape",
      }),
    ).toEqual({
      rememberedStop: "delegate",
      type: "closeAutocomplete",
    });

    expect(
      resolveInboxZeroAutocompleteEscapeCommand({
        activeStop: "delegate",
        isAutocompleteField: false,
        isTrusted: true,
        key: "Escape",
      }),
    ).toEqual({ type: "noop" });
  });

  it("maps due-date Ctrl or Cmd navigation keys to the autocomplete menu arrows", () => {
    expect(
      getInboxZeroDueDateRemapKey({
        altKey: false,
        ctrlKey: true,
        key: "n",
        metaKey: false,
        shiftKey: false,
      }),
    ).toBe("ArrowDown");

    expect(
      getInboxZeroDueDateRemapKey({
        altKey: false,
        ctrlKey: true,
        key: "p",
        metaKey: false,
        shiftKey: false,
      }),
    ).toBe("ArrowUp");

    expect(
      getInboxZeroDueDateRemapKey({
        altKey: false,
        ctrlKey: false,
        key: "n",
        metaKey: true,
        shiftKey: false,
      }),
    ).toBe("ArrowDown");

    expect(
      getInboxZeroDueDateRemapKey({
        altKey: false,
        ctrlKey: false,
        key: "p",
        metaKey: true,
        shiftKey: false,
      }),
    ).toBe("ArrowUp");

    expect(
      getInboxZeroDueDateRemapKey({
        altKey: false,
        ctrlKey: false,
        key: "n",
        metaKey: false,
        shiftKey: false,
      }),
    ).toBeNull();
  });
});
