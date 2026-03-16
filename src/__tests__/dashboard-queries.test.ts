import { describe, expect, it } from "vitest";

import {
  buildProjectCompletionHistoryQuery,
  buildRecentlyCompletedProjectsQuery,
} from "../queries/dashboard";

describe("dashboard queries", () => {
  it("buildProjectCompletionHistoryQuery scopes rows to project uids and returns timing fields", () => {
    const q = buildProjectCompletionHistoryQuery(["project-1", "project-2"]);

    expect(q.inputs).toEqual([["project-1", "project-2"]]);
    expect(q.query).toContain(":in $ [?project-uid ...]");
    expect(q.query).toContain(":find ?project-uid ?todo-uid ?create-time ?edit-time ?is-done");
    expect(q.query).toContain("Todo List::");
    expect(q.query).toContain("[[Todo List]]");
    expect(q.query).toContain('"DONE"');
    expect(q.query).toContain('"ARCHIVED"');
    expect(q.query).toContain('"TODO"');
  });

  it("buildRecentlyCompletedProjectsQuery filters status edits to the selected week", () => {
    const q = buildRecentlyCompletedProjectsQuery(1000, 2000);

    expect(q.inputs).toEqual([1000, 2000]);
    expect(q.query).toContain(":find ?project-uid ?project-title ?edit-time");
    expect(q.query).toContain("?week-start");
    expect(q.query).toContain("?week-end");
    expect(q.query).toContain(':node/title "✅"');
    expect(q.query).toContain(':node/title "checkmark"');
    expect(q.query).toContain(":edit/time");
  });
});
