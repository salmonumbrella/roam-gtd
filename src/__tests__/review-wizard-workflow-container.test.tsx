import React from "react";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createWorkflowContainerDomHarness,
  createWorkflowSession,
  createWorkflowSnapshot,
  createWorkflowStore,
  renderWorkflowStepContainer,
} from "./helpers/workflow-container-test-helpers";

let waitingRenderCount = 0;
let ticklerRenderCount = 0;

vi.mock("../people", () => ({
  fetchAllPeople: vi.fn(async () => []),
  sortPeopleEntries: vi.fn((entries: Array<unknown>) => entries),
}));

vi.mock("../triage/support", () => ({
  loadTriageProjects: vi.fn(
    async ({ onUpdate }: { onUpdate?: (projects: Array<unknown>) => void } = {}) => {
      const projects: Array<unknown> = [];
      onUpdate?.(projects);
      return projects;
    },
  ),
}));

vi.mock("../components/WaitingForStep", () => ({
  WaitingForStep: ({ waitingItems }: { waitingItems: Array<{ uid: string }> }) => {
    waitingRenderCount += 1;
    return <div data-testid="waiting-step">{waitingItems.map((item) => item.uid).join(",")}</div>;
  },
}));

vi.mock("../components/TicklerStep", () => ({
  TicklerStep: ({ groups }: { groups: Array<{ dailyPageUid: string }> }) => {
    ticklerRenderCount += 1;
    return (
      <div data-testid="tickler-step">{groups.map((group) => group.dailyPageUid).join(",")}</div>
    );
  },
}));

describe("WorkflowStepContainer", () => {
  let domHarness: ReturnType<typeof createWorkflowContainerDomHarness>;

  beforeEach(() => {
    waitingRenderCount = 0;
    ticklerRenderCount = 0;
    domHarness = createWorkflowContainerDomHarness();
  });

  afterEach(() => {
    domHarness.cleanup();
  });

  it("does not re-render when projects slices change", async () => {
    const { session } = createWorkflowSession("workflow");
    const harness = createWorkflowStore(createWorkflowSnapshot());

    await renderWorkflowStepContainer({
      root: domHarness.root,
      session,
      stepIndex: 3,
      stepKey: "waitingDelegated",
      store: harness.store,
    });

    const initialRenderCount = waitingRenderCount;
    const currentSnapshot = harness.store.getSnapshot();

    await act(async () => {
      harness.emit({
        ...currentSnapshot,
        projects: [{ uid: "project-1" }],
      });
    });

    expect(waitingRenderCount).toBe(initialRenderCount);
  });

  it("reuses the same container for tickler while reporting through the tickler controller", async () => {
    const { controller, session } = createWorkflowSession("tickler");
    const { store } = createWorkflowStore(createWorkflowSnapshot());

    await renderWorkflowStepContainer({
      root: domHarness.root,
      session,
      stepIndex: 6,
      stepKey: "tickler",
      store,
    });

    expect(ticklerRenderCount).toBe(1);
    expect(controller.publishSnapshot).toHaveBeenCalledWith(
      "tickler",
      expect.objectContaining({
        header: expect.objectContaining({
          title: "Step 7: Tickler",
        }),
      }),
    );
  });
});
