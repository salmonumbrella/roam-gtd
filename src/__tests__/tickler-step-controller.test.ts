import { describe, expect, it } from "vitest";

import { createTicklerStepController } from "../review/controllers/tickler-step-controller";
import type { TodoItem } from "../types";

function createTodo(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    ageDays: 0,
    createdTime: 0,
    deferredDate: null,
    pageTitle: "Tickler",
    text: "{{[[TODO]]}} Follow up",
    uid: "todo-1",
    ...overrides,
  };
}

function t(key: string): string {
  if (key === "step7Title") {
    return "Tickler";
  }
  return key;
}

describe("createTicklerStepController", () => {
  it("keeps tickler detail ownership inside the tickler controller", async () => {
    const controller = createTicklerStepController({
      getBodyGroups: () => [
        {
          dailyPageUid: "page-1",
          dailyTitle: "March 10th, 2026",
          items: [createTodo()],
        },
      ],
      getStateGroups: () => [],
      t,
    });

    await controller.activate("tickler");
    controller.openTicklerDetail("page-1");

    expect(controller.getSnapshot("tickler").detail.pageUid).toBe("page-1");
    expect(controller.getSnapshot("tickler").detail.activeGroup?.dailyTitle).toBe(
      "March 10th, 2026",
    );
  });
});
