import { describe, expect, it } from "vitest";

import {
  createProjectDetailHarness,
  createProjectDetailProject,
} from "./helpers/review-wizard-project-detail-harness";

describe("review wizard project detail behavior", () => {
  it("creates an optimistic todo immediately and focuses the generated todo uid", async () => {
    const project = createProjectDetailProject({
      pageUid: "project-launch",
      todoListUid: "todo-list-1",
    });
    const harness = createProjectDetailHarness({
      bodyProjects: [project],
      generatedUids: ["todo-1"],
      stateProjects: [project],
    });

    try {
      await harness.render();

      await harness.handleCreateProjectTodo(project);

      expect(harness.createBlock).toHaveBeenCalledWith({
        block: { string: "{{[[TODO]]}} ", uid: "todo-1" },
        location: { order: "last", "parent-uid": "todo-list-1" },
      });
      expect(harness.getValue().projectFocusRequestUid).toBe("todo-1");
      expect(harness.getValue().displayProjects[0]).toEqual(
        expect.objectContaining({
          lastTodoText: "{{[[TODO]]}} ",
          lastTodoUid: "todo-1",
          todoCount: 1,
          todoListUid: "todo-list-1",
        }),
      );
    } finally {
      harness.cleanup();
    }
  });

  it("delegates by creating a todo when the project has none and only focuses when one already exists", async () => {
    const withoutTodo = createProjectDetailProject({
      pageUid: "project-empty",
      todoListUid: "todo-list-empty",
    });
    const harness = createProjectDetailHarness({
      bodyProjects: [withoutTodo],
      generatedUids: ["todo-created"],
      stateProjects: [withoutTodo],
    });

    try {
      await harness.render();

      await harness.handleProjectTodoHotkeyAction("delegate", withoutTodo);

      expect(harness.createBlock).toHaveBeenCalledTimes(1);
      expect(harness.getValue().projectFocusRequestUid).toBe("todo-created");
    } finally {
      harness.cleanup();
    }

    const withTodo = createProjectDetailProject({
      lastTodoCreatedTime: 10,
      lastTodoText: "{{[[TODO]]}} Existing project todo",
      lastTodoUid: "todo-existing",
      pageUid: "project-existing",
      todoCount: 1,
      todoListUid: "todo-list-existing",
    });
    const existingHarness = createProjectDetailHarness({
      bodyProjects: [withTodo],
      stateProjects: [withTodo],
    });

    try {
      await existingHarness.render();

      await existingHarness.handleProjectTodoHotkeyAction("delegate", withTodo);

      expect(existingHarness.createBlock).not.toHaveBeenCalled();
      expect(existingHarness.getValue().projectFocusRequestUid).toBe("todo-existing");
    } finally {
      existingHarness.cleanup();
    }
  });

  it("removes the todo marker for reference actions and replaces workflow tags without duplicating them", async () => {
    const referenceProject = createProjectDetailProject({
      lastTodoCreatedTime: 10,
      lastTodoText: "{{[[TODO]]}} Call Alice #up",
      lastTodoUid: "todo-reference",
      pageUid: "project-reference",
      todoCount: 1,
      todoListUid: "todo-list-reference",
    });
    const referenceHarness = createProjectDetailHarness({
      bodyProjects: [referenceProject],
      stateProjects: [referenceProject],
    });

    try {
      referenceHarness.setBlockString("todo-reference", "{{[[TODO]]}} Call Alice #up");
      await referenceHarness.render();

      await referenceHarness.handleProjectTodoHotkeyAction("reference", referenceProject);

      expect(referenceHarness.updateBlock).toHaveBeenCalledWith({
        block: { string: "Call Alice #up", uid: "todo-reference" },
      });
      expect(referenceHarness.getValue().displayProjects[0]?.lastTodoText).toBe("Call Alice #up");
    } finally {
      referenceHarness.cleanup();
    }

    const tagProject = createProjectDetailProject({
      lastTodoCreatedTime: 10,
      lastTodoText: "{{[[TODO]]}} Call Alice #up",
      lastTodoUid: "todo-tag",
      pageUid: "project-tag",
      todoCount: 1,
      todoListUid: "todo-list-tag",
    });
    const tagHarness = createProjectDetailHarness({
      bodyProjects: [tagProject],
      stateProjects: [tagProject],
    });

    try {
      tagHarness.setBlockString("todo-tag", "{{[[TODO]]}} Call Alice #up");
      await tagHarness.render();

      await tagHarness.handleProjectTodoHotkeyAction("watch", tagProject);

      expect(tagHarness.updateBlock).toHaveBeenCalledWith({
        block: { string: "{{[[TODO]]}} Call Alice #[[watch]]", uid: "todo-tag" },
      });
      expect(tagHarness.getValue().displayProjects[0]?.lastTodoText).toBe(
        "{{[[TODO]]}} Call Alice #[[watch]]",
      );

      tagHarness.updateBlock.mockClear();
      tagHarness.setBlockString("todo-tag", "{{[[TODO]]}} Call Alice #[[watch]]");

      await tagHarness.handleProjectTodoHotkeyAction(
        "watch",
        createProjectDetailProject({
          ...tagProject,
          lastTodoText: "{{[[TODO]]}} Call Alice #[[watch]]",
        }),
      );

      expect(tagHarness.updateBlock).not.toHaveBeenCalled();
      expect(tagHarness.getValue().displayProjects[0]?.lastTodoText).toBe(
        "{{[[TODO]]}} Call Alice #[[watch]]",
      );
    } finally {
      tagHarness.cleanup();
    }
  });

  it("clears focus requests when handled and when optimistic todos sync or disappear", async () => {
    const project = createProjectDetailProject({
      pageUid: "project-focus",
      todoListUid: "todo-list-focus",
    });
    const harness = createProjectDetailHarness({
      bodyProjects: [project],
      generatedUids: ["todo-focus"],
      stateProjects: [project],
    });

    try {
      await harness.render();

      await harness.handleCreateProjectTodo(project);
      expect(harness.getValue().projectFocusRequestUid).toBe("todo-focus");

      await harness.handleProjectFocusRequestHandled();
      expect(harness.getValue().projectFocusRequestUid).toBeNull();
    } finally {
      harness.cleanup();
    }

    const syncHarness = createProjectDetailHarness({
      bodyProjects: [project],
      generatedUids: ["todo-sync"],
      stateProjects: [project],
    });

    try {
      await syncHarness.render();
      await syncHarness.handleCreateProjectTodo(project);

      expect(syncHarness.getValue().projectFocusRequestUid).toBe("todo-sync");

      await syncHarness.rerender({
        stateProjects: [
          createProjectDetailProject({
            lastTodoCreatedTime: 100,
            lastTodoText: "{{[[TODO]]}} Synced todo",
            lastTodoUid: "todo-sync",
            pageUid: "project-focus",
            todoCount: 1,
            todoListUid: "todo-list-focus",
          }),
        ],
      });

      expect(syncHarness.getValue().projectFocusRequestUid).toBeNull();
    } finally {
      syncHarness.cleanup();
    }

    const deleteHarness = createProjectDetailHarness({
      bodyProjects: [project],
      generatedUids: ["todo-delete"],
      stateProjects: [project],
    });

    try {
      await deleteHarness.render();
      await deleteHarness.handleCreateProjectTodo(project);

      expect(deleteHarness.getValue().projectFocusRequestUid).toBe("todo-delete");

      deleteHarness.deleteBlock("todo-delete");
      await deleteHarness.handleProjectTodoBlur("todo-delete");

      expect(deleteHarness.getValue().projectFocusRequestUid).toBeNull();
      expect(deleteHarness.getValue().displayProjects[0]?.lastTodoUid).toBeNull();
      expect(deleteHarness.store.scheduleRefresh).toHaveBeenCalledWith(expect.anything(), 0, {
        scope: "projects",
      });
    } finally {
      deleteHarness.cleanup();
    }
  });

  it("schedules project refresh only when dismissing a project with optimistic local edits and reloads persisted dismissals on reset", async () => {
    const alpha = createProjectDetailProject({
      pageTitle: "Project Alpha",
      pageUid: "project-alpha",
      todoListUid: "todo-list-alpha",
    });
    const beta = createProjectDetailProject({
      pageTitle: "Project Beta",
      pageUid: "project-beta",
      todoListUid: "todo-list-beta",
    });
    const harness = createProjectDetailHarness({
      bodyProjects: [alpha, beta],
      generatedUids: ["todo-alpha"],
      stateProjects: [alpha, beta],
    });

    try {
      await harness.render();

      await harness.handleDismissProject(alpha);

      expect(harness.store.scheduleRefresh).not.toHaveBeenCalled();
      expect(harness.getValue().dismissedProjectUids.has("project-alpha")).toBe(true);
      expect(harness.getValue().visibleProjectDetails.map((project) => project.pageUid)).toEqual([
        "project-beta",
      ]);

      await harness.handleCreateProjectTodo(beta);
      await harness.handleDismissProject(beta);

      expect(harness.store.scheduleRefresh).toHaveBeenCalledWith(expect.anything(), 800, {
        scope: "projects",
      });

      const storageEntries = harness.getLocalStorageEntries();
      expect(storageEntries).toHaveLength(1);
      expect(JSON.parse(storageEntries[0]!.value)).toEqual(["project-alpha", "project-beta"]);

      harness.replaceOnlyStoredDismissedProjects(["project-beta"]);
      await harness.resetProjectDetailState();

      expect(harness.getValue().dismissedProjectUids.has("project-alpha")).toBe(false);
      expect(harness.getValue().dismissedProjectUids.has("project-beta")).toBe(true);
      expect(harness.getValue().visibleProjectDetails.map((project) => project.pageUid)).toEqual([
        "project-alpha",
      ]);
    } finally {
      harness.cleanup();
    }
  });

  it("reconciles a changed status from Roam when detail closes", async () => {
    const project = createProjectDetailProject({
      pageUid: "project-status",
      statusBlockUid: "status-block",
      statusText: "up",
    });
    const harness = createProjectDetailHarness({
      bodyProjects: [project],
      stateProjects: [project],
    });

    try {
      harness.setBlockString("status-block", "Status:: watch");
      await harness.render();

      await harness.handleOpenProjectDetail(project);
      await harness.handleCloseProjectDetail();

      expect(harness.store.refresh).toHaveBeenCalledTimes(1);
      expect(harness.getValue().projectDetailPageUid).toBeNull();
      expect(harness.getValue().displayProjects[0]?.statusText).toBe("watch");
    } finally {
      harness.cleanup();
    }
  });

  it("keeps an optimistic status change when closing detail and Roam still reports the old status", async () => {
    const project = createProjectDetailProject({
      pageUid: "project-launch",
      statusBlockUid: "status-launch",
      statusText: "up",
    });
    const harness = createProjectDetailHarness({
      bodyProjects: [project],
      stateProjects: [project],
    });

    try {
      harness.setBlockString("status-launch", "Status:: up");
      await harness.render();

      await harness.handleOpenProjectDetail(project);
      await harness.handleProjectStatusChange(project, "watch");

      expect(harness.getValue().displayProjects[0]?.statusText).toBe("#watch");
      harness.setBlockString("status-launch", "Status:: up");

      await harness.handleCloseProjectDetail();

      expect(harness.store.refresh).toHaveBeenCalledTimes(1);
      expect(harness.store.refresh).toHaveBeenCalledWith(expect.anything(), {
        scope: "projects",
      });
      expect(harness.getValue().projectDetailPageUid).toBeNull();
      expect(harness.getValue().displayProjects[0]?.statusText).toBe("#watch");
    } finally {
      harness.cleanup();
    }
  });
});
