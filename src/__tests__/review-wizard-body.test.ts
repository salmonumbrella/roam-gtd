import { describe, expect, it } from "vitest";

import {
  getReviewWizardVisibleCollections,
  getReviewWizardWorkflowPopoverState,
  getTicklerGroupItemCount,
} from "../review/wizard-body";
import type { TodoItem } from "../types";

function createItem(uid: string): TodoItem {
  return {
    ageDays: 0,
    createdTime: 0,
    deferredDate: null,
    pageTitle: "Page",
    text: uid,
    uid,
  };
}

describe("review wizard body helpers", () => {
  it("keeps original collections when there are no hidden items", () => {
    const items = [createItem("item-1")];
    const bodyItems = [createItem("item-2")];
    const delegatedItems = [createItem("item-3")];
    const bodyDelegatedItems = [createItem("item-4")];
    const bodyWaitingItems = [createItem("item-5")];

    const result = getReviewWizardVisibleCollections({
      bodyDelegatedItems,
      bodyItems,
      bodyWaitingItems,
      delegatedItems,
      hiddenUids: new Set<string>(),
      items,
    });

    expect(result.visibleItems).toBe(items);
    expect(result.bodyVisibleItems).toBe(bodyItems);
    expect(result.visibleDelegatedItems).toBe(delegatedItems);
    expect(result.bodyVisibleDelegatedItems).toBe(bodyDelegatedItems);
    expect(result.bodyVisibleWaitingItems).toBe(bodyWaitingItems);
  });

  it("filters hidden items across all visible collections", () => {
    const result = getReviewWizardVisibleCollections({
      bodyDelegatedItems: [createItem("keep"), createItem("hide")],
      bodyItems: [createItem("keep"), createItem("hide")],
      bodyWaitingItems: [createItem("hide"), createItem("keep-waiting")],
      delegatedItems: [createItem("hide"), createItem("keep-delegated")],
      hiddenUids: new Set(["hide"]),
      items: [createItem("hide"), createItem("keep")],
    });

    expect(result.visibleItems.map((item) => item.uid)).toEqual(["keep"]);
    expect(result.bodyVisibleItems.map((item) => item.uid)).toEqual(["keep"]);
    expect(result.visibleDelegatedItems.map((item) => item.uid)).toEqual(["keep-delegated"]);
    expect(result.bodyVisibleDelegatedItems.map((item) => item.uid)).toEqual(["keep"]);
    expect(result.bodyVisibleWaitingItems.map((item) => item.uid)).toEqual(["keep-waiting"]);
  });

  it("only exposes a workflow popover state for workflow steps", () => {
    const triage = {
      anchorElement: {} as HTMLElement,
      currentTag: "#up",
      item: createItem("item-1"),
    };

    expect(
      getReviewWizardWorkflowPopoverState({
        activeWorkflowTriage: triage,
        bodyStepKey: "projects",
        triagePeople: [],
        triageProjects: [],
        workflowTriagePosition: { left: 10, top: 20 },
      }),
    ).toBeNull();

    expect(
      getReviewWizardWorkflowPopoverState({
        activeWorkflowTriage: triage,
        bodyStepKey: "upcoming",
        triagePeople: [],
        triageProjects: [],
        workflowTriagePosition: { left: 10, top: 20 },
      }),
    ).toMatchObject({
      triage,
      triageUid: "item-1",
      x: 10,
      y: 20,
    });
  });

  it("sums tickler items across groups", () => {
    expect(
      getTicklerGroupItemCount([
        { dailyPageUid: "day-1", dailyTitle: "Day 1", items: [createItem("a"), createItem("b")] },
        { dailyPageUid: "day-2", dailyTitle: "Day 2", items: [createItem("c")] },
      ]),
    ).toBe(3);
  });
});
