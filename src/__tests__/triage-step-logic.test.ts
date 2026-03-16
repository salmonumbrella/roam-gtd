import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../settings";
import { stripTodoPrefix } from "../tag-utils";
import {
  hasDoneOrArchivedMarker,
  inferTriageCounterActionFromBlock,
  isBlockCategorized,
} from "../triage/step-logic";

describe("triage step task-text consumers", () => {
  it("treats bracket-only closed markers as closed items", () => {
    expect(hasDoneOrArchivedMarker("[[DONE]] follow up")).toBe(true);
    expect(hasDoneOrArchivedMarker("[[ARCHIVED]] hidden item")).toBe(true);
  });

  it("keeps legacy open TODO variants uncategorized until a workflow tag is applied", () => {
    expect(inferTriageCounterActionFromBlock("[[TODO]] plain item", DEFAULT_SETTINGS)).toBeNull();
    expect(inferTriageCounterActionFromBlock("TODO plain item", DEFAULT_SETTINGS)).toBeNull();
    expect(isBlockCategorized("[[TODO]] plain item", DEFAULT_SETTINGS)).toBe(false);
    expect(isBlockCategorized("TODO plain item", DEFAULT_SETTINGS)).toBe(false);
  });
});

describe("stripTodoPrefix", () => {
  it("strips legacy leading task markers through the shared task-text helpers", () => {
    expect(stripTodoPrefix("[[DONE]] shipped")).toBe("shipped");
    expect(stripTodoPrefix("TODO follow up")).toBe("follow up");
    expect(stripTodoPrefix("{{[[ARCHIVED]]}} hidden")).toBe("hidden");
  });
});
