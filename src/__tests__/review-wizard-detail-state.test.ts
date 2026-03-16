import { describe, expect, it } from "vitest";

import { createProjectsStepController } from "../review/controllers/projects-step-controller";
import { createWorkflowStepController } from "../review/controllers/workflow-step-controller";
import { getReviewWizardDetailState } from "../review/wizard-detail-state";
import type { ProjectSummary, TicklerGroup, TodoItem } from "../types";

function makeTicklerGroup(overrides: Partial<TicklerGroup> = {}): TicklerGroup {
  return {
    dailyPageUid: "day-1",
    dailyTitle: "March 12th, 2026",
    items: [],
    ...overrides,
  };
}

function makeProject(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    doneCount: 0,
    lastDoneTime: null,
    lastTodoCreatedTime: null,
    lastTodoText: null,
    lastTodoUid: null,
    pageTitle: "Project Alpha",
    pageUid: "project-1",
    statusBlockUid: null,
    statusText: null,
    todoCount: 0,
    todoListUid: null,
    totalCount: 0,
    ...overrides,
  };
}

function makeTodo(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    ageDays: 0,
    createdTime: 0,
    deferredDate: null,
    pageTitle: "Inbox",
    text: "Follow up",
    uid: "todo-1",
    ...overrides,
  };
}

function t(key: string): string {
  switch (key) {
    case "step2Title":
      return "Projects";
    case "step4Title":
      return "Waiting For";
    default:
      return key;
  }
}

describe("review wizard detail state", () => {
  it("derives person detail only for the waiting-for step", () => {
    const waitingState = getReviewWizardDetailState({
      activeProjectPageTitle: null,
      bodyTicklerGroups: [],
      delegatedPeople: [{ title: "Alice Example", uid: "person-1" }],
      isProjectDetailOpen: false,
      personDetailUid: "person-1",
      stateTicklerGroups: [],
      stepKey: "waitingDelegated",
      stepTitle: "Waiting For",
      ticklerDetailPageUid: null,
    });

    expect(waitingState.activeDetailKind).toBe("person");
    expect(waitingState.activePersonDetail?.title).toBe("Alice Example");
    expect(waitingState.isPersonDetailOpen).toBe(true);

    const otherStepState = getReviewWizardDetailState({
      activeProjectPageTitle: null,
      bodyTicklerGroups: [],
      delegatedPeople: [{ title: "Alice Example", uid: "person-1" }],
      isProjectDetailOpen: false,
      personDetailUid: "person-1",
      stateTicklerGroups: [],
      stepKey: "upcoming",
      stepTitle: "Next Actions",
      ticklerDetailPageUid: null,
    });

    expect(otherStepState.activeDetailKind).toBe("none");
    expect(otherStepState.activePersonDetail).toBeNull();
    expect(otherStepState.isPersonDetailOpen).toBe(false);
  });

  it("prefers body tickler detail data and falls back to state tickler data", () => {
    const bodyGroup = makeTicklerGroup({
      dailyPageUid: "day-42",
      dailyTitle: "April 1st, 2026",
    });
    const fallbackGroup = makeTicklerGroup({
      dailyPageUid: "day-42",
      dailyTitle: "Fallback April 1st, 2026",
    });

    const bodyState = getReviewWizardDetailState({
      activeProjectPageTitle: null,
      bodyTicklerGroups: [bodyGroup],
      delegatedPeople: [],
      isProjectDetailOpen: false,
      personDetailUid: null,
      stateTicklerGroups: [fallbackGroup],
      stepKey: "tickler",
      stepTitle: "Tickler",
      ticklerDetailPageUid: "day-42",
    });

    expect(bodyState.activeDetailKind).toBe("tickler");
    expect(bodyState.activeTicklerDetail).toEqual(bodyGroup);
    expect(bodyState.dialogTitleText).toBe("April 1st, 2026");

    const fallbackState = getReviewWizardDetailState({
      activeProjectPageTitle: null,
      bodyTicklerGroups: [],
      delegatedPeople: [],
      isProjectDetailOpen: false,
      personDetailUid: null,
      stateTicklerGroups: [fallbackGroup],
      stepKey: "tickler",
      stepTitle: "Tickler",
      ticklerDetailPageUid: "day-42",
    });

    expect(fallbackState.activeDetailKind).toBe("tickler");
    expect(fallbackState.activeTicklerDetail).toEqual(fallbackGroup);
    expect(fallbackState.dialogTitleText).toBe("Fallback April 1st, 2026");
  });

  it("uses person, then tickler, then project, then step title precedence for dialog title", () => {
    const personState = getReviewWizardDetailState({
      activeProjectPageTitle: "Launch Site",
      bodyTicklerGroups: [],
      delegatedPeople: [{ title: "Alice Example", uid: "person-1" }],
      isProjectDetailOpen: true,
      personDetailUid: "person-1",
      stateTicklerGroups: [],
      stepKey: "waitingDelegated",
      stepTitle: "Waiting For",
      ticklerDetailPageUid: null,
    });

    expect(personState.dialogTitleText).toBe("Alice Example");

    const ticklerState = getReviewWizardDetailState({
      activeProjectPageTitle: "Launch Site",
      bodyTicklerGroups: [makeTicklerGroup({ dailyPageUid: "day-3", dailyTitle: "May 2nd, 2026" })],
      delegatedPeople: [],
      isProjectDetailOpen: true,
      personDetailUid: null,
      stateTicklerGroups: [],
      stepKey: "tickler",
      stepTitle: "Tickler",
      ticklerDetailPageUid: "day-3",
    });

    expect(ticklerState.dialogTitleText).toBe("May 2nd, 2026");

    const projectState = getReviewWizardDetailState({
      activeProjectPageTitle: "Launch Site",
      bodyTicklerGroups: [],
      delegatedPeople: [],
      isProjectDetailOpen: true,
      personDetailUid: null,
      stateTicklerGroups: [],
      stepKey: "projects",
      stepTitle: "Projects",
      ticklerDetailPageUid: null,
    });

    expect(projectState.dialogTitleText).toBe("Project: Launch Site");

    const dashboardProjectState = getReviewWizardDetailState({
      activeProjectPageTitle: "Velocity Dashboard",
      bodyTicklerGroups: [],
      delegatedPeople: [],
      isProjectDetailOpen: true,
      personDetailUid: null,
      stateTicklerGroups: [],
      stepKey: "stats",
      stepTitle: "Weekly Review",
      ticklerDetailPageUid: null,
    });

    expect(dashboardProjectState.dialogTitleText).toBe("Project: Velocity Dashboard");

    const stepState = getReviewWizardDetailState({
      activeProjectPageTitle: "Launch Site",
      bodyTicklerGroups: [],
      delegatedPeople: [],
      isProjectDetailOpen: false,
      personDetailUid: null,
      stateTicklerGroups: [],
      stepKey: "upcoming",
      stepTitle: "Next Actions",
      ticklerDetailPageUid: null,
    });

    expect(stepState.dialogTitleText).toBe("Next Actions");
  });

  it("derives back-action and shared chrome from person, tickler, and project detail state", () => {
    const personState = getReviewWizardDetailState({
      activeProjectPageTitle: null,
      bodyTicklerGroups: [],
      delegatedPeople: [{ title: "Alice Example", uid: "person-1" }],
      isProjectDetailOpen: false,
      personDetailUid: "person-1",
      stateTicklerGroups: [],
      stepKey: "waitingDelegated",
      stepTitle: "Waiting For",
      ticklerDetailPageUid: null,
    });

    expect(personState.backAction).toBe("closePersonDetail");
    expect(personState.chromeState.backAction).toBe("closeDetail");
    expect(personState.chromeState.showPrimaryForward).toBe(false);

    const ticklerState = getReviewWizardDetailState({
      activeProjectPageTitle: null,
      bodyTicklerGroups: [makeTicklerGroup({ dailyPageUid: "day-9" })],
      delegatedPeople: [],
      isProjectDetailOpen: false,
      personDetailUid: null,
      stateTicklerGroups: [],
      stepKey: "tickler",
      stepTitle: "Tickler",
      ticklerDetailPageUid: "day-9",
    });

    expect(ticklerState.backAction).toBe("closeTicklerDetail");
    expect(ticklerState.chromeState.backAction).toBe("closeDetail");

    const projectState = getReviewWizardDetailState({
      activeProjectPageTitle: "Projects:: Launch Site",
      bodyTicklerGroups: [],
      delegatedPeople: [],
      isProjectDetailOpen: true,
      personDetailUid: null,
      stateTicklerGroups: [],
      stepKey: "projects",
      stepTitle: "Projects",
      ticklerDetailPageUid: null,
    });

    expect(projectState.backAction).toBe("closeProjectDetail");
    expect(projectState.isProjectDetailOpen).toBe(true);
    expect(projectState.chromeState.backAction).toBe("closeDetail");

    const wizardState = getReviewWizardDetailState({
      activeProjectPageTitle: null,
      bodyTicklerGroups: [],
      delegatedPeople: [],
      isProjectDetailOpen: false,
      personDetailUid: null,
      stateTicklerGroups: [],
      stepKey: "projects",
      stepTitle: "Projects",
      ticklerDetailPageUid: null,
    });

    expect(wizardState.backAction).toBe("wizard");
    expect(wizardState.activeDetailKind).toBe("none");
    expect(wizardState.chromeState.backAction).toBe("wizard");
    expect(wizardState.chromeState.showPrimaryForward).toBe(true);

    const dashboardProjectState = getReviewWizardDetailState({
      activeProjectPageTitle: "Projects:: Launch Site",
      bodyTicklerGroups: [],
      delegatedPeople: [],
      isProjectDetailOpen: true,
      personDetailUid: null,
      stateTicklerGroups: [],
      stepKey: "stats",
      stepTitle: "Weekly Review",
      ticklerDetailPageUid: null,
    });

    expect(dashboardProjectState.backAction).toBe("closeProjectDetail");
    expect(dashboardProjectState.isProjectDetailOpen).toBe(true);
    expect(dashboardProjectState.chromeState.backAction).toBe("closeDetail");
  });

  it("keeps project detail ownership inside the projects controller", async () => {
    const project = makeProject({
      pageTitle: "Launch Site",
      pageUid: "project-launch",
    });
    const controller = createProjectsStepController({
      getBodyProjects: () => [project],
      getStateProjects: () => [project],
      t,
    });

    await controller.activate("projects");
    controller.openProjectDetail(project);

    expect(controller.getSnapshot("projects").detail.projectUid).toBe("project-launch");
    expect(controller.getSnapshot("projects").detail.activeProject?.pageTitle).toBe("Launch Site");
  });

  it("keeps workflow person detail and triage state inside the workflow controller", async () => {
    const item = makeTodo({ text: "Review draft", uid: "wait-1" });
    const anchorElement = {
      getBoundingClientRect: () => ({ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 }),
      isConnected: true,
    } as unknown as HTMLElement;
    const controller = createWorkflowStepController({
      getDelegatedPeople: () => [{ title: "Alice Example", uid: "person-1" }],
      getVisibleItems: () => [item],
      t,
    });

    await controller.activate("waitingDelegated");
    controller.openPersonDetail("person-1");
    controller.openWorkflowTriage({
      anchorElement,
      currentTag: "watch",
      item,
    });

    expect(controller.getSnapshot("waitingDelegated").detail.personUid).toBe("person-1");
    expect(controller.getSnapshot("waitingDelegated").detail.activePersonDetail?.title).toBe(
      "Alice Example",
    );
    expect(controller.getSnapshot("waitingDelegated").detail.activeTriageUid).toBe("wait-1");
  });
});
