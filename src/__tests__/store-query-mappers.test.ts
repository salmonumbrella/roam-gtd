import { describe, expect, it } from "vitest";

import { formatRoamDate, toRoamLogId } from "../date-utils";
import {
  attachProjectTodoRows,
  buildTicklerGroups,
  categorizeWorkflowTodoRows,
  mapCompletedTodoRows,
  mapProjectSummaryRows,
} from "../store/query-mappers";
import { TEST_SETTINGS } from "./fixtures";

describe("store query mappers", () => {
  it("keeps project todo counts while choosing the highest-priority visible todo preview", () => {
    const projects = mapProjectSummaryRows([
      ["Project:: Ship launch", "project-1", "Status:: #[[ON_TRACK]]", "status-1", "list-1"],
    ]);

    const result = attachProjectTodoRows(projects, [
      ["project-1", "todo-ref", "{{[[TODO]]}} ((source-uid))", 900, 1],
      ["project-1", "todo-real", "{{[[TODO]]}} Send launch note", 1000, 1],
      ["project-1", "todo-priority", "{{[[TODO]]}} Review blockers", 800, 2],
    ]);

    expect(result).toEqual([
      {
        doneCount: 0,
        lastDoneTime: null,
        lastTodoCreatedTime: 800,
        lastTodoText: "{{[[TODO]]}} Review blockers",
        lastTodoUid: "todo-priority",
        pageTitle: "Ship launch",
        pageUid: "project-1",
        statusBlockUid: "status-1",
        statusText: "#[[ON_TRACK]]",
        todoCount: 3,
        todoListUid: "list-1",
        totalCount: 3,
      },
    ]);
  });

  it("maps completed rows with edit time without changing shared todo mapping", () => {
    const result = mapCompletedTodoRows([
      ["done-1", "{{[[DONE]]}} Ship it", "Ship launch", 1000, 2500],
    ]);

    expect(result).toEqual([
      {
        ageDays: expect.any(Number),
        createdTime: 1000,
        deferredDate: null,
        editTime: 2500,
        pageTitle: "Ship launch",
        text: "{{[[DONE]]}} Ship it",
        uid: "done-1",
      },
    ]);
  });

  it("categorizes open workflow rows by configured tag", () => {
    const groups = categorizeWorkflowTodoRows(
      [
        ["next", "{{[[TODO]]}} next", "Page", 10, TEST_SETTINGS.tagNextAction],
        ["wait", "{{[[TODO]]}} wait", "Page", 11, TEST_SETTINGS.tagWaitingFor],
        ["delegated", "{{[[TODO]]}} delegated", "Page", 12, TEST_SETTINGS.tagDelegated],
        ["someday", "{{[[TODO]]}} someday", "Page", 13, TEST_SETTINGS.tagSomeday],
        ["closed", "[[DONE]] closed", "Page", 14, TEST_SETTINGS.tagNextAction],
      ],
      TEST_SETTINGS,
    );

    expect(groups.nextActions.map((item) => item.uid)).toEqual(["next"]);
    expect(groups.waitingFor.map((item) => item.uid)).toEqual(["wait"]);
    expect(groups.delegated.map((item) => item.uid)).toEqual(["delegated"]);
    expect(groups.someday.map((item) => item.uid)).toEqual(["someday"]);
  });

  it("builds tickler groups with daily page uids and dedupes per day", () => {
    const march10 = formatRoamDate(new Date(2026, 2, 10));
    const groups = buildTicklerGroups({
      monthEndLogId: toRoamLogId(new Date(2026, 2, 31)),
      monthStartLogId: toRoamLogId(new Date(2026, 2, 1)),
      resolveDailyPageUid: (dailyLogId) => `daily-page-${dailyLogId}`,
      scheduledPageRefRows: [
        ["uid-linked", "Call back", 1000, march10, toRoamLogId(new Date(2026, 2, 10))],
      ],
      scheduledRows: [
        ["uid-linked", "{{[[TODO]]}} newer", 2000, `Due:: [[${march10}]]`],
        ["uid-closed", "[[DONE]] closed", 3000, `Due:: [[${march10}]]`],
      ],
    });

    expect(groups).toEqual([
      {
        dailyPageUid: `daily-page-${toRoamLogId(new Date(2026, 2, 10))}`,
        dailyTitle: march10,
        items: [
          expect.objectContaining({
            createdTime: 2000,
            uid: "uid-linked",
          }),
        ],
      },
    ]);
  });
});
