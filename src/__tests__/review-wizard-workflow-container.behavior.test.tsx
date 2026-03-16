import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createControlledRenderBlockHarness,
  createWorkflowContainerDomHarness,
  createWorkflowSession,
  createWorkflowSnapshot,
  createWorkflowStore,
  createWorkflowTodo,
  renderWorkflowStepContainer,
} from "./helpers/workflow-container-test-helpers";

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

describe("WorkflowStepContainer behavior", () => {
  let domHarness: ReturnType<typeof createWorkflowContainerDomHarness>;
  let renderBlockHarness: ReturnType<typeof createControlledRenderBlockHarness>;

  beforeEach(() => {
    renderBlockHarness = createControlledRenderBlockHarness();
    domHarness = createWorkflowContainerDomHarness({
      renderBlock: renderBlockHarness.renderBlock,
    });
  });

  afterEach(() => {
    domHarness.cleanup();
  });

  it("shows workflow row chrome before block content is ready and the rendered block only after readiness", async () => {
    const { session } = createWorkflowSession("workflow");
    const state = createWorkflowStore(createWorkflowSnapshot());

    await renderWorkflowStepContainer({
      root: domHarness.root,
      session,
      stepIndex: 3,
      stepKey: "waitingDelegated",
      store: state.store,
    });

    expect(domHarness.root.querySelector(".roam-gtd-unified-row")).toBeNull();

    await act(async () => {
      state.emit(
        createWorkflowSnapshot({
          waitingFor: [
            createWorkflowTodo("waiting-1", {
              ageDays: 3,
              pageTitle: "Waiting",
              text: "{{[[TODO]]}} Follow up with vendor",
            }),
          ],
          workflowHydrated: true,
        }),
      );
    });
    await domHarness.flushScheduledWork();

    expect(domHarness.root.querySelector(".roam-gtd-unified-row")).not.toBeNull();
    expect(domHarness.root.querySelector(".roam-gtd-unified-row .gtd-skeleton")).not.toBeNull();
    expect(domHarness.root.querySelector(".roam-gtd-unified-row .rm-block__input")).toBeNull();
    expect(domHarness.root.querySelector(".roam-gtd-unified-row__stale")).toBeNull();

    await renderBlockHarness.waitForPending("waiting-1", domHarness.flushScheduledWork);
    await renderBlockHarness.publishReady("waiting-1", "Follow up with vendor");

    expect(domHarness.root.querySelector(".roam-gtd-unified-row .gtd-skeleton")).toBeNull();
    expect(
      domHarness.root.querySelector(".roam-gtd-unified-row .rm-block__input")?.textContent,
    ).toBe("Follow up with vendor");
    expect(domHarness.root.querySelector(".roam-gtd-unified-row__stale")?.textContent).toBe(
      "3 days",
    );
  });

  it("shows tickler row output through the real step chain only after the block content becomes ready", async () => {
    const { controller, session } = createWorkflowSession("tickler");
    const state = createWorkflowStore(createWorkflowSnapshot());

    await renderWorkflowStepContainer({
      root: domHarness.root,
      session,
      stepIndex: 6,
      stepKey: "tickler",
      store: state.store,
    });

    expect(domHarness.root.textContent).toContain("This month: 0");
    expect(domHarness.root.querySelector(".roam-gtd-unified-row")).toBeNull();
    expect(controller.publishSnapshot).toHaveBeenCalledWith(
      "tickler",
      expect.objectContaining({
        stepSlot: expect.objectContaining({
          mode: "loading",
        }),
      }),
    );

    await act(async () => {
      state.emit(
        createWorkflowSnapshot({
          backHalfHydrated: true,
          ticklerItems: [
            {
              dailyPageUid: "dnp-1",
              dailyTitle: "March 14th, 2026",
              items: [
                createWorkflowTodo("tickler-1", {
                  ageDays: 5,
                  pageTitle: "Tickler",
                  text: "{{[[TODO]]}} Renew passport",
                }),
              ],
            },
          ],
        }),
      );
    });
    await domHarness.flushScheduledWork();

    expect(domHarness.root.textContent).toContain("This month: 1");
    expect(
      domHarness.root.querySelector(".roam-gtd-person-header-button")?.textContent?.trim(),
    ).toBe("March 14th, 2026");
    expect(domHarness.root.querySelector(".roam-gtd-unified-row")).not.toBeNull();
    expect(domHarness.root.querySelector(".roam-gtd-unified-row .gtd-skeleton")).not.toBeNull();
    expect(domHarness.root.querySelector(".roam-gtd-unified-row .rm-block__input")).toBeNull();
    expect(domHarness.root.querySelector(".roam-gtd-unified-row__stale")).toBeNull();
    expect(controller.publishSnapshot).toHaveBeenLastCalledWith(
      "tickler",
      expect.objectContaining({
        stepSlot: expect.objectContaining({
          mode: "ready",
        }),
      }),
    );

    await renderBlockHarness.waitForPending("tickler-1", domHarness.flushScheduledWork);
    await renderBlockHarness.publishReady("tickler-1", "Renew passport");

    expect(domHarness.root.querySelector(".roam-gtd-unified-row .gtd-skeleton")).toBeNull();
    expect(
      domHarness.root.querySelector(".roam-gtd-unified-row .rm-block__input")?.textContent,
    ).toBe("Renew passport");
    expect(domHarness.root.querySelector(".roam-gtd-unified-row__stale")?.textContent).toBe(
      "5 days",
    );
  });
});
