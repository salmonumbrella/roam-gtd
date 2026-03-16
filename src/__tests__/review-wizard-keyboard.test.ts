import { describe, expect, it, vi } from "vitest";

import {
  dispatchReviewWizardArchiveKeydown,
  dispatchReviewWizardNavigationKeydown,
  dispatchReviewWizardNavigationKeyup,
  resolveReviewWizardArchiveCommand,
  resolveReviewWizardNavigationShortcut,
  toggleReviewWizardArchivedMarker,
} from "../review/wizard-keyboard";

function createElementLike(
  overrides: Partial<{
    classNames: Array<string>;
    tagName: string;
  }> = {},
): HTMLElement {
  const classNames = overrides.classNames ?? [];
  const tagName = overrides.tagName ?? "DIV";
  const element = {
    classList: {
      contains: (value: string) => classNames.includes(value),
    },
    closest: (selector: string) => {
      const selectors = selector.split(",").map((value) => value.trim());
      for (const candidate of selectors) {
        if (candidate === "textarea" && tagName === "TEXTAREA") {
          return element;
        }
        if (candidate.startsWith(".") && classNames.includes(candidate.slice(1))) {
          return element;
        }
      }
      return null;
    },
    nodeType: 1,
    tagName,
  };
  return element as unknown as HTMLElement;
}

function createReviewDialogLike(activeElement: HTMLElement | null): HTMLElement {
  return {
    contains: (candidate: unknown) => candidate === activeElement,
  } as HTMLElement;
}

function createKeyboardEventLike(
  overrides: Partial<{
    altKey: boolean;
    code: string;
    ctrlKey: boolean;
    key: string;
    metaKey: boolean;
    shiftKey: boolean;
  }> = {},
) {
  return {
    altKey: false,
    code: "",
    ctrlKey: false,
    key: "",
    metaKey: false,
    preventDefault: vi.fn(),
    shiftKey: false,
    stopImmediatePropagation: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  };
}

describe("toggleReviewWizardArchivedMarker", () => {
  it("adds archived to open task text and removes it when already archived", () => {
    expect(toggleReviewWizardArchivedMarker("{{[[TODO]]}} Review follow-up")).toBe(
      "{{[[ARCHIVED]]}} Review follow-up",
    );
    expect(toggleReviewWizardArchivedMarker("{{[[ARCHIVED]]}} Review follow-up")).toBe(
      "Review follow-up",
    );
  });
});

describe("resolveReviewWizardArchiveCommand", () => {
  it("returns a toggle command for Shift+Cmd/Ctrl+Enter in a review block input", () => {
    const activeElement = createElementLike({
      classNames: ["rm-block-input"],
      tagName: "TEXTAREA",
    });

    expect(
      resolveReviewWizardArchiveCommand({
        activeElement,
        blockString: "{{[[TODO]]}} follow up",
        event: createKeyboardEventLike({
          key: "Enter",
          metaKey: true,
          shiftKey: true,
        }),
        focusedBlockUidFromUi: null,
        getFocusedModalBlockUid: () => "todo-1",
        isWorkflowStepActive: true,
        reviewDialog: createReviewDialogLike(activeElement),
      }),
    ).toEqual({
      hideOptimistically: true,
      nextText: "{{[[ARCHIVED]]}} follow up",
      type: "toggleArchive",
      uid: "todo-1",
    });
  });

  it("reconciles the focused UI block without rewriting when Roam already reports focus", () => {
    const activeElement = createElementLike({
      classNames: ["rm-block-input"],
      tagName: "TEXTAREA",
    });

    expect(
      resolveReviewWizardArchiveCommand({
        activeElement,
        blockString: "{{[[TODO]]}} follow up",
        event: createKeyboardEventLike({
          ctrlKey: true,
          key: "Enter",
          shiftKey: true,
        }),
        focusedBlockUidFromUi: "todo-2",
        getFocusedModalBlockUid: () => "todo-1",
        isWorkflowStepActive: true,
        reviewDialog: createReviewDialogLike(activeElement),
      }),
    ).toEqual({
      type: "reconcileFocusedUiBlock",
      uid: "todo-2",
    });
  });
});

describe("dispatchReviewWizardArchiveKeydown", () => {
  it("consumes toggle events and dispatches the archive callback", () => {
    const activeElement = createElementLike({
      classNames: ["rm-block-input"],
      tagName: "TEXTAREA",
    });
    const event = createKeyboardEventLike({
      key: "Enter",
      metaKey: true,
      shiftKey: true,
    });
    const onToggleArchive = vi.fn();

    const command = dispatchReviewWizardArchiveKeydown({
      activeElement,
      blockString: "{{[[TODO]]}} follow up",
      event,
      focusedBlockUidFromUi: null,
      getFocusedModalBlockUid: () => "todo-1",
      isWorkflowStepActive: false,
      onReconcileFocusedUiBlock: vi.fn(),
      onToggleArchive,
      reviewDialog: createReviewDialogLike(activeElement),
    });

    expect(command).toEqual({
      hideOptimistically: false,
      nextText: "{{[[ARCHIVED]]}} follow up",
      type: "toggleArchive",
      uid: "todo-1",
    });
    expect(onToggleArchive).toHaveBeenCalledWith({
      hideOptimistically: false,
      nextText: "{{[[ARCHIVED]]}} follow up",
      type: "toggleArchive",
      uid: "todo-1",
    });
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
  });
});

describe("resolveReviewWizardNavigationShortcut", () => {
  it("detects modifier bracket shortcuts and plain arrow shortcuts", () => {
    expect(
      resolveReviewWizardNavigationShortcut(
        createKeyboardEventLike({
          code: "BracketLeft",
          key: "[",
          metaKey: true,
        }),
      ),
    ).toEqual({
      direction: "back",
      isModifierShortcut: true,
    });
    expect(
      resolveReviewWizardNavigationShortcut(
        createKeyboardEventLike({
          ctrlKey: true,
          key: "]",
        }),
      ),
    ).toEqual({
      direction: "forward",
      isModifierShortcut: true,
    });
    expect(
      resolveReviewWizardNavigationShortcut(
        createKeyboardEventLike({
          key: "ArrowLeft",
        }),
      ),
    ).toEqual({
      direction: "back",
      isModifierShortcut: false,
    });
    expect(
      resolveReviewWizardNavigationShortcut(
        createKeyboardEventLike({
          key: "ArrowRight",
        }),
      ),
    ).toEqual({
      direction: "forward",
      isModifierShortcut: false,
    });
  });
});

describe("navigation dispatch", () => {
  it("ignores plain arrow navigation while editing but still handles modifier shortcuts", () => {
    const editingElement = createElementLike({ tagName: "TEXTAREA" });
    const onNavigateBack = vi.fn();
    const arrowEvent = createKeyboardEventLike({ key: "ArrowLeft" });

    expect(
      dispatchReviewWizardNavigationKeydown({
        activeElement: editingElement,
        event: arrowEvent,
        isEditableElement: (element) => element === editingElement,
        onNavigateBack,
        onNavigateForward: vi.fn(),
      }),
    ).toBe(false);
    expect(onNavigateBack).not.toHaveBeenCalled();
    expect(arrowEvent.preventDefault).not.toHaveBeenCalled();

    const modifierEvent = createKeyboardEventLike({
      code: "BracketLeft",
      metaKey: true,
    });

    expect(
      dispatchReviewWizardNavigationKeydown({
        activeElement: editingElement,
        event: modifierEvent,
        isEditableElement: (element) => element === editingElement,
        onNavigateBack,
        onNavigateForward: vi.fn(),
      }),
    ).toBe(true);
    expect(onNavigateBack).toHaveBeenCalledOnce();
    expect(modifierEvent.preventDefault).toHaveBeenCalledOnce();
  });

  it("consumes matching keyup events without dispatching navigation callbacks", () => {
    const event = createKeyboardEventLike({ key: "ArrowRight" });

    expect(
      dispatchReviewWizardNavigationKeyup({
        activeElement: null,
        event,
        isEditableElement: () => false,
      }),
    ).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
  });
});
