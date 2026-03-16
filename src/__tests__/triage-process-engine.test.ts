import { beforeEach, describe, expect, it, vi } from "vitest";

const triagePlan = {
  hasDelegateIntent: false,
  hasProjectIntent: false,
  presentWorkflowTags: [] as Array<string>,
  shouldAutoTagAsUp: false,
  shouldPromoteToNext: false,
  shouldRunProjectFlow: false,
  workflowTags: [] as Array<string>,
};

const mocks = vi.hoisted(() => ({
  appendTag: vi.fn(async () => undefined),
  clearDueDateChild: vi.fn(async () => []),
  createEvent: vi.fn(async () => undefined),
  formatCalendarEventSummary: vi.fn((value: string) => `Event: ${value}`),
  getOrCreatePersonPage: vi.fn(async () => ({ title: "Alice", uid: "person-uid" })),
  getUnifiedTriageProcessPlan: vi.fn(() => ({ ...triagePlan })),
  hasDoneOrArchivedMarker: vi.fn(() => false),
  isBlockCategorized: vi.fn(() => false),
  isGoogleCalendarAvailable: vi.fn(() => true),
  notifyDelegatedAgent: vi.fn(async () => undefined),
  replaceTags: vi.fn(async () => true),
  showTriageToast: vi.fn(),
  stripTagToken: vi.fn((value: string) => value),
  submitProjectSelection: vi.fn(async (..._args: Array<unknown>) => false),
  syncDelegatedAgendaEntry: vi.fn(async () => undefined),
  upsertContextChild: vi.fn(async () => undefined),
  upsertDueDateChild: vi.fn(async () => []),
  wireAgendaForTaggedPeople: vi.fn(async () => undefined),
}));

vi.mock("../google-calendar", () => ({
  createEvent: mocks.createEvent,
  formatCalendarEventSummary: mocks.formatCalendarEventSummary,
  isGoogleCalendarAvailable: mocks.isGoogleCalendarAvailable,
}));

vi.mock("../people", () => ({
  getOrCreatePersonPage: mocks.getOrCreatePersonPage,
  syncDelegatedAgendaEntry: mocks.syncDelegatedAgendaEntry,
}));

vi.mock("../review/actions", () => ({
  appendTag: mocks.appendTag,
  replaceTags: mocks.replaceTags,
}));

vi.mock("../triage/step-logic", () => ({
  hasDoneOrArchivedMarker: mocks.hasDoneOrArchivedMarker,
  isBlockCategorized: mocks.isBlockCategorized,
  showTriageToast: mocks.showTriageToast,
  stripTagToken: mocks.stripTagToken,
  submitProjectSelection: mocks.submitProjectSelection,
  wireAgendaForTaggedPeople: mocks.wireAgendaForTaggedPeople,
}));

vi.mock("../triage/writes", () => ({
  clearDueDateChild: mocks.clearDueDateChild,
  upsertContextChild: mocks.upsertContextChild,
  upsertDueDateChild: mocks.upsertDueDateChild,
}));

vi.mock("../unified-triage-flow", () => ({
  getUnifiedTriageProcessPlan: mocks.getUnifiedTriageProcessPlan,
}));

import type { ScheduleIntent } from "../components/SchedulePopover";
import { resolveSubmitIntent, runTriageProcess } from "../triage/process-engine";
import { TEST_SETTINGS } from "./fixtures";

const settings = {
  ...TEST_SETTINGS,
  showTooltips: false,
};

function createProcessInput(overrides: Partial<Parameters<typeof runTriageProcess>[0]> = {}) {
  const pullLatestBlockString = vi.fn(async (_uid: string, fallback = "") => fallback);
  const syncPersistedDueDateValue = vi.fn();
  const setBlockToSideView = vi.fn(async () => undefined);
  const onProjectHandled = vi.fn();

  return {
    currentTag: "watch",
    delegateReplaceTags: ["watch"],
    formState: {
      contextValue: "",
      delegateValue: "",
      persistedDueDate: "",
      projectQuery: "",
      scheduleIntent: null as ScheduleIntent | null,
      selectedProject: null,
      unsetDue: false,
    },
    item: {
      text: "{{[[TODO]]}} Review block",
      uid: "todo-uid",
    },
    notifyDelegatedAgent: mocks.notifyDelegatedAgent,
    onProjectHandled,
    people: [],
    projectFlow: {
      onCreateProjectFromInput: vi.fn(async () => undefined),
      onProjectHandled,
      onTeleportToProject: vi.fn(async () => undefined),
      removeTriageTagIfPresent: vi.fn(async (_uid: string, sourceText: string) => sourceText),
    },
    pullLatestBlockString,
    setBlockToSideView,
    settings,
    syncPersistedDueDateValue,
    t: (key: string) => key,
    ...overrides,
  };
}

describe("triage process engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUnifiedTriageProcessPlan.mockReturnValue({ ...triagePlan });
    mocks.hasDoneOrArchivedMarker.mockReturnValue(false);
    mocks.isBlockCategorized.mockReturnValue(false);
    mocks.isGoogleCalendarAvailable.mockReturnValue(true);
  });

  describe("resolveSubmitIntent", () => {
    it("auto-tags uncategorized items with context input so Step 1 and the popover share the same submit rule", () => {
      const result = resolveSubmitIntent({
        blockText: "{{[[TODO]]}} Review block",
        contextValue: "Desk",
        delegateValue: "",
        projectQuery: "",
        scheduledDateValue: "",
        selectedProject: null,
        settings,
        shouldUnsetDue: false,
      });

      expect(result).toEqual({
        autoTagAsUp: true,
        hasDelegateIntent: false,
        hasProjectIntent: false,
        shouldSubmit: true,
      });
    });

    it("keeps already categorized items submittable without auto-tagging them again", () => {
      mocks.isBlockCategorized.mockReturnValue(true);

      const result = resolveSubmitIntent({
        blockText: "{{[[TODO]]}} #watch Review block",
        contextValue: "",
        delegateValue: "",
        projectQuery: "",
        scheduledDateValue: "",
        selectedProject: null,
        settings,
        shouldUnsetDue: false,
      });

      expect(result).toEqual({
        autoTagAsUp: false,
        hasDelegateIntent: false,
        hasProjectIntent: false,
        shouldSubmit: true,
      });
    });
  });

  it("auto-tags uncategorized items as next actions and reports them as hidden", async () => {
    mocks.getUnifiedTriageProcessPlan.mockReturnValue({
      ...triagePlan,
      shouldAutoTagAsUp: true,
    });

    const input = createProcessInput();

    const result = await runTriageProcess(input);

    expect(mocks.appendTag).toHaveBeenCalledWith("todo-uid", "up", "{{[[TODO]]}} Review block");
    expect(result.shouldHide).toBe(true);
    expect(result.nextTag).toBe("up");
  });

  it("delegates scheduled items with shared agenda and calendar behavior", async () => {
    mocks.getUnifiedTriageProcessPlan.mockReturnValue({
      ...triagePlan,
      hasDelegateIntent: true,
      presentWorkflowTags: ["watch"],
      workflowTags: ["watch"],
    });

    const input = createProcessInput({
      formState: {
        contextValue: "Desk",
        delegateValue: "Alice",
        persistedDueDate: "",
        projectQuery: "",
        scheduleIntent: {
          date: new Date(2026, 1, 25, 9, 30),
          googleCalendarAccount: "Work Calendar",
          roamDate: "February 25th, 2026",
          time: "09:30",
        },
        selectedProject: null,
        unsetDue: false,
      },
    });

    const result = await runTriageProcess(input);

    expect(mocks.getOrCreatePersonPage).toHaveBeenCalledWith("Alice", ["people", "agents"]);
    expect(mocks.replaceTags).toHaveBeenCalledWith(
      "todo-uid",
      ["watch"],
      "delegated",
      "{{[[TODO]]}} Review block",
    );
    expect(mocks.upsertDueDateChild).toHaveBeenCalledWith(
      "todo-uid",
      "February 25th, 2026",
      expect.any(Function),
      undefined,
    );
    expect(mocks.createEvent).toHaveBeenCalledWith(
      "Event: {{[[TODO]]}} Review block",
      "todo-uid",
      new Date(2026, 1, 25, 9, 30),
      10,
      "Work Calendar",
    );
    expect(input.setBlockToSideView).toHaveBeenCalledWith("todo-uid");
    expect(mocks.syncDelegatedAgendaEntry).toHaveBeenCalledWith("todo-uid", "Alice");
    expect(mocks.wireAgendaForTaggedPeople).toHaveBeenCalled();
    expect(result.nextTag).toBe("delegated");
    expect(result.shouldHide).toBe(true);
  });

  it("hands project processing through submitProjectSelection and hides when handled", async () => {
    mocks.getUnifiedTriageProcessPlan.mockReturnValue({
      ...triagePlan,
      presentWorkflowTags: ["watch"],
      shouldRunProjectFlow: true,
      workflowTags: ["watch"],
    });
    mocks.submitProjectSelection.mockImplementation(async (...args: Array<unknown>) => {
      const [context] = args as [{ onProjectHandled: () => void }];
      const { onProjectHandled } = context;
      onProjectHandled();
      return true;
    });

    const input = createProcessInput();

    const result = await runTriageProcess(input);

    expect(mocks.submitProjectSelection).toHaveBeenCalled();
    expect(input.projectFlow.onProjectHandled).toHaveBeenCalledTimes(1);
    expect(result.projectHandled).toBe(true);
    expect(result.shouldHide).toBe(true);
  });

  it("strips the current triage tag before final context writes for Step 1 style completion", async () => {
    const removeCurrentTagIfPresent = vi.fn(async () => "{{[[TODO]]}} Review block");
    mocks.getUnifiedTriageProcessPlan.mockReturnValue({
      ...triagePlan,
      presentWorkflowTags: ["watch"],
      workflowTags: ["watch"],
    });
    mocks.hasDoneOrArchivedMarker.mockReturnValue(true);

    const input = createProcessInput({
      formState: {
        contextValue: "Desk",
        delegateValue: "",
        persistedDueDate: "",
        projectQuery: "",
        scheduleIntent: null,
        selectedProject: null,
        unsetDue: false,
      },
      item: {
        text: "{{[[TODO]]}} {{[[DONE]]}} Review block",
        uid: "todo-uid",
      },
      removeCurrentTagIfPresent,
      shouldRemoveCurrentTagOnFinalize: true,
    });

    const result = await runTriageProcess(input);

    expect(removeCurrentTagIfPresent).toHaveBeenCalledWith(
      "todo-uid",
      "{{[[TODO]]}} {{[[DONE]]}} Review block",
    );
    expect(removeCurrentTagIfPresent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.upsertContextChild.mock.invocationCallOrder[0],
    );
    expect(mocks.upsertContextChild).toHaveBeenCalledWith(
      "todo-uid",
      "Desk",
      expect.any(Function),
      undefined,
    );
    expect(mocks.wireAgendaForTaggedPeople).toHaveBeenCalledWith(
      expect.objectContaining({
        blockText: "{{[[TODO]]}} Review block",
      }),
    );
    expect(result.nextTag).toBe("watch");
    expect(result.shouldHide).toBe(false);
  });
});
