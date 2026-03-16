import { describe, expect, it } from "vitest";

import {
  getShortcutMutationPlan,
  resolveSubmitIntent,
  type InboxShortcutAction,
} from "../inbox-zero/actions";
import type { ProjectOption } from "../triage/support";
import { TEST_SETTINGS } from "./fixtures";

function makeShortcutPlan(action: InboxShortcutAction) {
  return getShortcutMutationPlan(action, TEST_SETTINGS);
}

describe("Inbox zero submit intent", () => {
  it("does not submit when the block is uncategorized and no form intent exists", () => {
    expect(
      resolveSubmitIntent({
        blockText: "{{[[TODO]]}} Draft idea",
        contextValue: "",
        delegateValue: "",
        projectQuery: "",
        scheduledDateValue: "",
        selectedProject: null,
        settings: TEST_SETTINGS,
        shouldUnsetDue: false,
      }),
    ).toEqual({
      autoTagAsUp: false,
      hasDelegateIntent: false,
      hasProjectIntent: false,
      shouldSubmit: false,
    });
  });

  it("auto-tags as next action when context or due date exists without another workflow intent", () => {
    expect(
      resolveSubmitIntent({
        blockText: "{{[[TODO]]}} Draft idea",
        contextValue: "Office",
        delegateValue: "",
        projectQuery: "",
        scheduledDateValue: "",
        selectedProject: null,
        settings: TEST_SETTINGS,
        shouldUnsetDue: false,
      }),
    ).toEqual({
      autoTagAsUp: true,
      hasDelegateIntent: false,
      hasProjectIntent: false,
      shouldSubmit: true,
    });
  });

  it("treats project selection as submit intent even when the block is otherwise uncategorized", () => {
    const selectedProject = { title: "Project:: Ops" } as ProjectOption;

    expect(
      resolveSubmitIntent({
        blockText: "{{[[TODO]]}} Draft idea",
        contextValue: "",
        delegateValue: "",
        projectQuery: "Ops",
        scheduledDateValue: "",
        selectedProject,
        settings: TEST_SETTINGS,
        shouldUnsetDue: false,
      }),
    ).toEqual({
      autoTagAsUp: false,
      hasDelegateIntent: false,
      hasProjectIntent: true,
      shouldSubmit: true,
    });
  });
});

describe("Inbox zero shortcut mutation plan", () => {
  it("maps watch to the waiting tag and keeps schedule support enabled", () => {
    expect(makeShortcutPlan("watch")).toEqual({
      counterAction: "watch",
      shortcutTag: TEST_SETTINGS.tagWaitingFor,
      shouldApplyContext: true,
      shouldApplySchedule: true,
    });
  });

  it("maps done/reference to immediate actions without workflow tags", () => {
    expect(makeShortcutPlan("done")).toEqual({
      counterAction: "done",
      shortcutTag: null,
      shouldApplyContext: true,
      shouldApplySchedule: false,
    });
    expect(makeShortcutPlan("reference")).toEqual({
      counterAction: "reference",
      shortcutTag: null,
      shouldApplyContext: false,
      shouldApplySchedule: false,
    });
  });
});
