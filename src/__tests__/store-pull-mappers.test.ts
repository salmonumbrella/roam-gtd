import { describe, expect, it } from "vitest";

import type { PulledProjectEntity } from "../store/query-mappers";
import { mapPulledProjects } from "../store/query-mappers";

const TAGS = {
  tagDelegated: "#delegated",
  tagNextAction: "#up",
  tagSomeday: "#someday",
  tagWaitingFor: "#watch",
};

function makeEntity(
  overrides: Partial<PulledProjectEntity> & {
    ":block/string": string;
    ":block/uid": string;
  },
): PulledProjectEntity {
  return { ":block/children": [], ...overrides };
}

describe("mapPulledProjects", () => {
  it("extracts project title and uid", () => {
    const result = mapPulledProjects(
      [makeEntity({ ":block/string": "Project:: [[My Project]]", ":block/uid": "p1" })],
      TAGS,
    );
    expect(result).toHaveLength(1);
    expect(result[0].doneCount).toBe(0);
    expect(result[0].lastDoneTime).toBeNull();
    expect(result[0].pageTitle).toBe("[[My Project]]");
    expect(result[0].pageUid).toBe("p1");
    expect(result[0].totalCount).toBe(0);
  });

  it("extracts status from Status:: child", () => {
    const result = mapPulledProjects(
      [
        makeEntity({
          ":block/children": [
            {
              ":block/refs": [{ ":node/title": "Status" }, { ":node/title": "ON_TRACK" }],
              ":block/string": "Status:: #ON_TRACK",
              ":block/uid": "s1",
            },
          ],
          ":block/string": "Project:: Test",
          ":block/uid": "p1",
        }),
      ],
      TAGS,
    );
    expect(result[0].statusText).toBe("#ON_TRACK");
    expect(result[0].statusBlockUid).toBe("s1");
  });

  it("extracts todo list uid and counts TODOs with priority", () => {
    const result = mapPulledProjects(
      [
        makeEntity({
          ":block/children": [
            {
              ":block/children": [
                {
                  ":block/refs": [{ ":node/title": "TODO" }, { ":node/title": "#up" }],
                  ":block/string": "{{[[TODO]]}} Task A #[[#up]]",
                  ":block/uid": "t1",
                  ":create/time": 1000,
                },
                {
                  ":block/refs": [{ ":node/title": "TODO" }],
                  ":block/string": "{{[[TODO]]}} Task B",
                  ":block/uid": "t2",
                  ":create/time": 2000,
                },
              ],
              ":block/refs": [{ ":node/title": "Todo List" }],
              ":block/string": "Todo List::",
              ":block/uid": "tl1",
            },
          ],
          ":block/string": "Project:: Test",
          ":block/uid": "p1",
        }),
      ],
      TAGS,
    );
    expect(result[0].todoListUid).toBe("tl1");
    expect(result[0].doneCount).toBe(0);
    expect(result[0].lastDoneTime).toBeNull();
    expect(result[0].todoCount).toBe(2);
    expect(result[0].lastTodoUid).toBe("t1"); // #up priority (4) > default (1)
    expect(result[0].totalCount).toBe(2);
  });

  it("counts DONE and ARCHIVED children separately and tracks the latest completion time", () => {
    const result = mapPulledProjects(
      [
        makeEntity({
          ":block/children": [
            {
              ":block/children": [
                {
                  ":block/refs": [{ ":node/title": "DONE" }],
                  ":block/string": "{{[[DONE]]}} Finished",
                  ":block/uid": "t1",
                  ":create/time": 1000,
                  ":edit/time": 1500,
                },
                {
                  ":block/refs": [{ ":node/title": "ARCHIVED" }],
                  ":block/string": "{{[[ARCHIVED]]}} Archived",
                  ":block/uid": "t3",
                  ":create/time": 1200,
                  ":edit/time": 2400,
                },
                {
                  ":block/refs": [{ ":node/title": "TODO" }],
                  ":block/string": "{{[[TODO]]}} Open task",
                  ":block/uid": "t2",
                  ":create/time": 2000,
                },
              ],
              ":block/refs": [{ ":node/title": "Todo List" }],
              ":block/string": "Todo List::",
              ":block/uid": "tl1",
            },
          ],
          ":block/string": "Project:: Test",
          ":block/uid": "p1",
        }),
      ],
      TAGS,
    );
    expect(result[0].doneCount).toBe(2);
    expect(result[0].lastDoneTime).toBe(2400);
    expect(result[0].todoCount).toBe(1);
    expect(result[0].lastTodoUid).toBe("t2");
    expect(result[0].totalCount).toBe(3);
  });

  it("filters inactive project markers", () => {
    const result = mapPulledProjects(
      [makeEntity({ ":block/string": "Project:: [[✅]] Done project", ":block/uid": "p1" })],
      TAGS,
    );
    expect(result).toHaveLength(0);
  });

  it("filters projects with non-reviewable status", () => {
    const result = mapPulledProjects(
      [
        makeEntity({
          ":block/children": [
            {
              ":block/refs": [{ ":node/title": "Status" }, { ":node/title": "PAUSED" }],
              ":block/string": "Status:: #PAUSED",
              ":block/uid": "s1",
            },
          ],
          ":block/string": "Project:: Paused",
          ":block/uid": "p1",
        }),
      ],
      TAGS,
    );
    expect(result).toHaveLength(0);
  });

  it("can include non-reviewable statuses for dashboard-only views", () => {
    const result = mapPulledProjects(
      [
        makeEntity({
          ":block/children": [
            {
              ":block/refs": [{ ":node/title": "Status" }, { ":node/title": "✅" }],
              ":block/string": "Status:: #[[✅]]",
              ":block/uid": "s1",
            },
          ],
          ":block/string": "Project:: Shipped",
          ":block/uid": "p1",
        }),
      ],
      TAGS,
      { includeNonReviewableStatuses: true },
    );

    expect(result).toHaveLength(1);
    expect(result[0].statusText).toBe("#[[✅]]");
  });

  it("handles projects with no children", () => {
    const result = mapPulledProjects(
      [makeEntity({ ":block/string": "Project:: Bare", ":block/uid": "p1" })],
      TAGS,
    );
    expect(result).toHaveLength(1);
    expect(result[0].doneCount).toBe(0);
    expect(result[0].lastDoneTime).toBeNull();
    expect(result[0].statusText).toBeNull();
    expect(result[0].todoListUid).toBeNull();
    expect(result[0].todoCount).toBe(0);
    expect(result[0].totalCount).toBe(0);
  });
});
