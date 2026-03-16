import { describe, expect, it } from "vitest";

import { replaceTagsInText } from "../review/actions";
import { DEFAULT_SETTINGS } from "../settings";
import { getUnifiedTriageProcessPlan, getWorkflowTags } from "../unified-triage-flow";

describe("replaceTagsInText", () => {
  it("removes all workflow tags before adding the next status", () => {
    const nextText = replaceTagsInText(
      "{{[[TODO]]}} Follow up #[[watch]] #[[delegated]]",
      getWorkflowTags(DEFAULT_SETTINGS),
      DEFAULT_SETTINGS.tagSomeday,
    );

    expect(nextText).toBe("{{[[TODO]]}} Follow up #[[someday]]");
  });
});

describe("getUnifiedTriageProcessPlan", () => {
  it("normalizes multi-tag workflow items to next actions when taking action", () => {
    const plan = getUnifiedTriageProcessPlan({
      blockString: "{{[[TODO]]}} Follow up #[[watch]] #[[delegated]]",
      contextQuery: "",
      currentTag: DEFAULT_SETTINGS.tagWaitingFor,
      delegateQuery: "",
      persistedDueDate: "",
      projectQuery: "",
      scheduleRoamDate: "",
      selectedProject: null,
      settings: DEFAULT_SETTINGS,
      shouldAutoTagAsUp: false,
      unsetDue: false,
    });

    expect(plan.shouldPromoteToNext).toBe(true);
    expect(plan.presentWorkflowTags).toEqual([
      DEFAULT_SETTINGS.tagWaitingFor,
      DEFAULT_SETTINGS.tagDelegated,
    ]);
  });

  it("keeps project handling enabled when delegate and project are both set", () => {
    const plan = getUnifiedTriageProcessPlan({
      blockString: "{{[[TODO]]}} Follow up #[[watch]]",
      contextQuery: "",
      currentTag: DEFAULT_SETTINGS.tagWaitingFor,
      delegateQuery: "Amy Yang",
      persistedDueDate: "",
      projectQuery: "Launch",
      scheduleRoamDate: "",
      selectedProject: null,
      settings: DEFAULT_SETTINGS,
      shouldAutoTagAsUp: false,
      unsetDue: false,
    });

    expect(plan.hasDelegateIntent).toBe(true);
    expect(plan.shouldRunProjectFlow).toBe(true);
    expect(plan.shouldPromoteToNext).toBe(false);
  });
});
