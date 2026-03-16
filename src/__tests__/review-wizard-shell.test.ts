import { JSDOM } from "jsdom";
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReviewSession, ReviewSessionSnapshot } from "../review/session/types";

vi.mock("@blueprintjs/core", () => ({
  Dialog: ({
    children,
    className,
    isOpen,
    title,
  }: {
    children: React.ReactNode;
    className?: string;
    isOpen: boolean;
    title?: React.ReactNode;
  }) =>
    isOpen
      ? React.createElement(
          "section",
          {
            className,
            role: "dialog",
          },
          title,
          children,
        )
      : null,
  ProgressBar: ({ value }: { value?: number }) =>
    React.createElement("div", {
      "aria-valuenow": value ?? 0,
      role: "progressbar",
    }),
}));

function createSnapshot(
  overrides: Partial<ReviewSessionSnapshot> = {},
  activeStepOverrides: Partial<ReviewSessionSnapshot["activeStep"]> = {},
): ReviewSessionSnapshot {
  const steps = [
    { description: "Process inbox", key: "inbox" as const, title: "Step 1: Inbox Zero" },
    { description: "Review projects", key: "projects" as const, title: "Step 2: Projects" },
    { description: "Review summary", key: "stats" as const, title: "Step 8: Summary" },
  ];

  return {
    activeStep: {
      controllerDomain: "inbox",
      step: steps[0],
      stepKey: "inbox",
      stepSnapshot: null,
      ...activeStepOverrides,
    },
    activeStepKey: "inbox",
    controllerStates: {
      dashboard: { error: null, snapshot: null, status: "cold", stepKey: null },
      inbox: { error: null, snapshot: null, status: "cold", stepKey: null },
      projects: { error: null, snapshot: null, status: "cold", stepKey: null },
      tickler: { error: null, snapshot: null, status: "cold", stepKey: null },
      workflow: { error: null, snapshot: null, status: "cold", stepKey: null },
    },
    mode: "weekly",
    steps,
    ...overrides,
  };
}

function createMockSession(initialSnapshot: ReviewSessionSnapshot): {
  session: ReviewSession;
  setSnapshot: (snapshot: ReviewSessionSnapshot) => void;
} {
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();

  return {
    session: {
      activate: vi.fn(async () => undefined),
      dispose: vi.fn(),
      getControllerDomainForStep: vi.fn((stepKey) => {
        if (stepKey === "triggerList") {
          return null;
        }
        if (stepKey === "stats") {
          return "dashboard";
        }
        if (stepKey === "projects") {
          return "projects";
        }
        return "inbox";
      }),
      getControllerForStep: vi.fn(() => null),
      getSnapshot: vi.fn(() => snapshot),
      subscribe: vi.fn((listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }),
    },
    setSnapshot(nextSnapshot: ReviewSessionSnapshot) {
      snapshot = nextSnapshot;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

describe("ReviewWizardShell", () => {
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

  it("activates only the active step on first render", async () => {
    const { ReviewWizardShell } = await import("../components/ReviewWizardShell");
    const { session } = createMockSession(createSnapshot());

    await act(async () => {
      ReactDOM.render(
        React.createElement(ReviewWizardShell, {
          isOpen: true,
          onClose: vi.fn(),
          registerShortcutHandler: true,
          session,
        }),
        root,
      );
    });

    expect(session.activate).toHaveBeenCalledWith("inbox");
    expect(session.activate).toHaveBeenCalledTimes(1);
  });

  it("renders header, progress, and footer chrome on the initial shell frame", async () => {
    const { ReviewWizardShell } = await import("../components/ReviewWizardShell");
    const { session } = createMockSession(createSnapshot());

    await act(async () => {
      ReactDOM.render(
        React.createElement(ReviewWizardShell, {
          isOpen: true,
          onClose: vi.fn(),
          registerShortcutHandler: true,
          session,
        }),
        root,
      );
    });

    expect(root.querySelector("[role='dialog']")).not.toBeNull();
    expect(root.textContent).toContain("Step 1: Inbox Zero");
    expect(root.querySelector("[role='progressbar']")).not.toBeNull();
    expect(root.textContent).toContain("Next");
  });

  it("renders inline loading and retry states through ReviewStepSlot", async () => {
    const { ReviewWizardShell } = await import("../components/ReviewWizardShell");
    const loadingSession = createMockSession(createSnapshot());

    await act(async () => {
      ReactDOM.render(
        React.createElement(ReviewWizardShell, {
          isOpen: true,
          onClose: vi.fn(),
          session: loadingSession.session,
        }),
        root,
      );
    });

    expect(root.querySelector("[data-testid='review-step-loading']")).not.toBeNull();

    loadingSession.setSnapshot(
      createSnapshot(
        {},
        {
          stepSnapshot: {
            footer: {
              leftAction: null,
              rightAction: null,
            },
            header: {
              legendSegments: null,
              progressValue: 0.25,
              title: "Step 1: Inbox Zero",
            },
            stepSlot: {
              error: new Error("boom"),
              mode: "error",
            },
          },
        },
      ),
    );

    expect(root.textContent).toContain("Retry");
  });

  it("renders controller-owned chrome from live session snapshot updates", async () => {
    const { ReviewWizardShell } = await import("../components/ReviewWizardShell");
    const sessionState = createMockSession(createSnapshot());

    await act(async () => {
      ReactDOM.render(
        React.createElement(ReviewWizardShell, {
          isOpen: true,
          onClose: vi.fn(),
          session: sessionState.session,
        }),
        root,
      );
    });

    sessionState.setSnapshot(
      createSnapshot(
        {},
        {
          stepSnapshot: {
            footer: {
              leftAction: null,
              rightAction: {
                action: "forward",
                intent: "primary",
                kind: "button",
                labelKey: "nextStep",
              },
            },
            header: {
              legendSegments: [{ color: "#fff", text: "u up" }],
              progressValue: 0.42,
              title: "Published Inbox",
            },
            stepSlot: {
              error: null,
              mode: "ready",
            },
          },
        },
      ),
    );

    expect(root.textContent).toContain("Published Inbox");
    expect(root.textContent).toContain("Next Step");
    expect(root.querySelector("[role='progressbar']")?.getAttribute("aria-valuenow")).toBe("0.42");
  });

  it("preserves modal-wide modifier suppression", async () => {
    const { ReviewWizardShell } = await import("../components/ReviewWizardShell");
    const { session } = createMockSession(
      createSnapshot(
        {},
        {
          stepSnapshot: {
            footer: {
              leftAction: null,
              rightAction: null,
            },
            header: {
              legendSegments: null,
              progressValue: 0.25,
              title: "Step 1: Inbox Zero",
            },
            stepSlot: {
              error: null,
              mode: "ready",
            },
          },
        },
      ),
    );

    await act(async () => {
      ReactDOM.render(
        React.createElement(ReviewWizardShell, {
          isOpen: true,
          onClose: vi.fn(),
          session,
        }),
        root,
      );
    });

    const metaP = new dom.window.KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "p",
      metaKey: true,
    });
    dom.window.dispatchEvent(metaP);
    expect(metaP.defaultPrevented).toBe(true);

    const ctrlP = new dom.window.KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "p",
    });
    dom.window.dispatchEvent(ctrlP);
    expect(ctrlP.defaultPrevented).toBe(true);

    const metaZ = new dom.window.KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "z",
      metaKey: true,
    });
    dom.window.dispatchEvent(metaZ);
    expect(metaZ.defaultPrevented).toBe(true);
  });
});
