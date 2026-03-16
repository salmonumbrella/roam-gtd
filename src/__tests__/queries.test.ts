import { describe, expect, it } from "vitest";

import { getMonthLogIdRange, toRoamLogId } from "../date-utils";
import {
  buildActiveProjectEntityIdsQuery,
  buildActiveProjectsQuery,
  buildAllProjectsByRecencyQuery,
  buildAllProjectsQuery,
  buildAllUpTodoUidsQuery,
  buildCompletedThisWeekQuery,
  buildContextsByRecencyQuery,
  buildContextsQuery,
  buildDeferredByTagsQuery,
  buildDelegatedPersonRefsQuery,
  buildInboxQuery,
  buildProjectTodoCandidatesQuery,
  buildPeopleByRecencyQuery,
  buildPeopleQuery,
  buildProjectSummaryQuery,
  buildProjectsQuery,
  buildStatusAttributeOptionsQuery,
  buildStatusWorkflowProjectsByRecencyQuery,
  buildStatusWorkflowProjectsQuery,
  buildStaleQuery,
  buildTicklerQuery,
  buildTicklerScheduledPageRefsQuery,
  buildTicklerScheduledItemsQuery,
  buildTodosByTagsQuery,
  buildTopGoalsQuery,
  buildTriageBlockEntityIdsQuery,
  buildUpTodosWithContextQuery,
} from "../queries";

describe("queries", () => {
  it("buildTodosByTagsQuery matches many tags and returns matched tag title", () => {
    const q = buildTodosByTagsQuery(["up", "watch"]);
    expect(q.query).toContain(":in $ [?tag-title ...]");
    expect(q.query).toContain("?tag-title");
    expect(q.query).toContain('(not [?done-tag :node/title "DONE"]');
    expect(q.query).toContain('(not [?archived-tag :node/title "ARCHIVED"]');
    expect(q.inputs).toEqual([["up", "watch"]]);
  });

  it("buildInboxQuery scopes TODOs to Triage context and excludes tagged items", () => {
    const q = buildInboxQuery("Triage", ["up", "watch", "delegated", "someday"]);
    expect(q.query).toContain(":block/parents");
    expect(q.query).toContain("?triage-parent");
    expect(q.query).toContain(":block/children ?block");
    expect(q.query).toContain("(or-join");
    expect(q.query).toContain(`[(= ?page ?triage-page)]`);
    expect(q.query).toContain(`(clojure.string/starts-with? ?project-ancestor-str "Project::")`);
    expect(q.query).toContain(`(not [?done-tag :node/title "DONE"]`);
    expect(q.query).toContain(`(not [?archived-tag :node/title "ARCHIVED"]`);
    expect(q.query).toContain("not");
    expect(q.inputs).toEqual(["Triage", "up", "watch", "delegated", "someday"]);
    // Each exclude tag gets its own (not ...) clause
    for (let i = 0; i < 4; i++) {
      expect(q.query).toContain(`?ex-tag-${i}`);
      expect(q.query).toContain(`?ex-page-${i}`);
    }
  });

  it("buildInboxQuery dynamically generates not clauses for 2 tags", () => {
    const q = buildInboxQuery("Triage", ["up", "watch"]);
    expect(q.inputs).toEqual(["Triage", "up", "watch"]);
    expect(q.query).toContain("?ex-tag-0");
    expect(q.query).toContain("?ex-tag-1");
    expect(q.query).not.toContain("?ex-tag-2");
    // Two tag exclusions + project-ancestor + DONE + ARCHIVED exclusions
    const notMatches = q.query.match(/\(not /g);
    expect(notMatches).toHaveLength(5);
  });

  it("buildInboxQuery dynamically generates not clauses for 5 tags", () => {
    const tags = ["up", "watch", "delegated", "someday", "blocked"];
    const q = buildInboxQuery("Triage", tags);
    expect(q.inputs).toEqual(["Triage", ...tags]);
    for (let i = 0; i < 5; i++) {
      expect(q.query).toContain(`?ex-tag-${i}`);
      expect(q.query).toContain(
        `(not [?ex-page-${i} :node/title ?ex-tag-${i}] [?block :block/refs ?ex-page-${i}])`,
      );
    }
    expect(q.query).not.toContain("?ex-tag-5");
    const notMatches = q.query.match(/\(not /g);
    expect(notMatches).toHaveLength(8);
  });

  it("buildInboxQuery handles zero exclude tags", () => {
    const q = buildInboxQuery("Triage", []);
    expect(q.inputs).toEqual(["Triage"]);
    const notMatches = q.query.match(/\(not /g);
    expect(notMatches).toHaveLength(3);
  });

  it("buildStaleQuery accepts cutoff", () => {
    const cutoff = Date.now() - 1000;
    const todayLogId = toRoamLogId(new Date(2026, 1, 27));
    const q = buildStaleQuery(cutoff, todayLogId);
    expect(q.query).toContain(":create/time");
    expect(q.query).toContain("?today-log-id");
    expect(q.query).toContain(":log/id ?page-log-id");
    expect(q.inputs).toEqual([cutoff, todayLogId]);
  });

  it("buildDeferredByTagsQuery supports tag lists", () => {
    const q = buildDeferredByTagsQuery(["up", "watch", "delegated"]);
    expect(q.query).toContain(":in $ [?tag-title ...]");
    expect(q.query).toContain("?tag-title");
    expect(q.query).toContain(":log/id");
    expect(q.inputs[0]).toEqual(["up", "watch", "delegated"]);
    expect(q.inputs.length).toBe(1);
  });

  it("buildTopGoalsQuery uses block refs for indexed lookup", () => {
    const q = buildTopGoalsQuery("Top Goal");
    expect(q.query).toContain(":block/refs");
    expect(q.query).toContain(":log/id");
    expect(q.inputs[0]).toBe("Top Goal");
    expect(q.inputs.length).toBe(1);
  });

  it("buildCompletedThisWeekQuery uses week bounds input", () => {
    const start = 1_707_264_000_000;
    const end = 1_707_868_800_000;
    const q = buildCompletedThisWeekQuery(start, end);
    expect(q.query).toContain(":find ?uid ?s ?page-title ?create-time ?edit-time");
    expect(q.query).toContain("DONE");
    expect(q.query).toContain("ARCHIVED");
    expect(q.query).toContain(":create/time");
    expect(q.query).toContain(":edit/time");
    expect(q.query).toContain("?week-start");
    expect(q.query).toContain("?week-end");
    expect(q.inputs).toEqual([start, end]);
  });

  it("buildProjectsQuery excludes daily notes and has aggregate find", () => {
    const q = buildProjectsQuery();
    expect(q.query).toContain("(count ?block)");
    expect(q.query).toContain("(not [?page :log/id ?page-log-id])");
    expect(q.inputs.length).toBe(0);
  });

  it("buildActiveProjectsQuery finds pages with Project:: attribute", () => {
    const q = buildActiveProjectsQuery();
    expect(q.query).toContain(":find ?page-title ?page-uid");
    expect(q.query).toContain(`(clojure.string/starts-with? ?project-str "Project::")`);
    expect(q.query).toContain(`(clojure.string/includes? ?project-str "[[Project]]")`);
    expect(q.query).toContain("(not");
  });

  it("buildStatusWorkflowProjectsQuery matches projects via Status workflow", () => {
    const q = buildStatusWorkflowProjectsQuery();
    expect(q.inputs).toEqual([]);
    expect(q.query).toContain(":find ?page-title ?project-block-uid ?project-str");
    expect(q.query).toContain(`(clojure.string/starts-with? ?project-str "Project::")`);
    expect(q.query).toContain(`(clojure.string/starts-with? ?status-str "Status::")`);
    expect(q.query).toContain("[?page :block/children ?project-block]");
    expect(q.query).toContain("[?project-block :block/uid ?project-block-uid]");
    expect(q.query).toContain("[?project-block :block/children ?status-block]");
    expect(q.query).toContain("[?page :node/title ?page-title]");
    expect(q.query).toContain('[?closed-ref :node/title "✅"]');
    expect(q.query).toContain('[?cancel-ref :node/title "❌"]');
  });

  it("buildStatusWorkflowProjectsByRecencyQuery aggregates latest interaction time", () => {
    const q = buildStatusWorkflowProjectsByRecencyQuery();
    expect(q.inputs).toEqual([]);
    expect(q.query).toContain(
      ":find ?page-title ?project-block-uid ?project-str (max ?interaction-time)",
    );
    expect(q.query).toContain("(or-join [?interaction-block ?project-block]");
    expect(q.query).toContain("[?project-block :block/children ?interaction-block]");
    expect(q.query).toContain("[?interaction-block :block/parents ?project-block]");
    expect(q.query).toContain("[?interaction-block :block/refs ?project-block]");
    expect(q.query).toContain("(or-join [?interaction-block ?interaction-time]");
    expect(q.query).toContain("[?interaction-block :create/time ?interaction-time]");
    expect(q.query).toContain("[?interaction-block :edit/time ?interaction-time]");
    expect(q.query).toContain('[?cancel-ref :node/title "❌"]');
  });

  it("buildAllProjectsQuery matches every Project:: block", () => {
    const q = buildAllProjectsQuery();
    expect(q.inputs).toEqual([]);
    expect(q.query).toContain(":find ?page-title ?project-block-uid ?project-str");
    expect(q.query).toContain("[?project-block :block/page ?page]");
    expect(q.query).toContain("[?project-block :block/string ?project-str]");
    expect(q.query).toContain('(clojure.string/starts-with? ?project-str "Project::")');
  });

  it("buildAllProjectsByRecencyQuery ranks all Project:: blocks by latest interaction", () => {
    const q = buildAllProjectsByRecencyQuery();
    expect(q.inputs).toEqual([]);
    expect(q.query).toContain(
      ":find ?page-title ?project-block-uid ?project-str (max ?interaction-time)",
    );
    expect(q.query).toContain("[?project-block :block/page ?page]");
    expect(q.query).toContain("(or-join [?interaction-block ?project-block]");
    expect(q.query).toContain("[?interaction-block :block/parents ?project-block]");
    expect(q.query).toContain("[?interaction-block :block/refs ?project-block]");
  });

  it("buildStatusAttributeOptionsQuery finds children of Status under roam/js/attribute-select", () => {
    const q = buildStatusAttributeOptionsQuery();
    expect(q.inputs).toEqual([]);
    expect(q.query).toContain(':node/title "roam/js/attribute-select"');
    expect(q.query).toContain('[?status-block :block/string "Status"]');
    expect(q.query).toContain('[?attributes-block :block/string "attributes"]');
    expect(q.query).toContain('[?options-block :block/string "options"]');
    expect(q.query).toContain("(or-join [?page ?option-str ?option-order]");
    expect(q.query).toContain(":find ?option-str ?option-order");
    expect(q.query).toContain("[?option-block :block/order ?option-order]");
  });

  it("buildPeopleQuery finds pages tagged with configured delegate tags", () => {
    const q = buildPeopleQuery(["people", "agents"]);
    expect(q.inputs).toEqual([["people", "agents"]]);
    expect(q.query).toContain(":in $ [?delegate-tag-title ...]");
    expect(q.query).toContain("?delegate-tag-title");
    expect(q.query).toContain("?page-title");
    expect(q.query).toContain("?page-uid");
    expect(q.query).toContain("clojure.string/includes?");
    expect(q.query).toContain("```");
  });

  it("buildPeopleByRecencyQuery aggregates latest interaction from page blocks and refs", () => {
    const q = buildPeopleByRecencyQuery(["people", "agents", "employee"]);
    expect(q.inputs).toEqual([["people", "agents", "employee"]]);
    expect(q.query).toContain(":in $ [?delegate-tag-title ...]");
    expect(q.query).toContain("(max ?interaction-edit-time)");
    expect(q.query).toContain("[?interaction-block :block/page ?page]");
    expect(q.query).toContain("[?interaction-block :block/refs ?page]");
    expect(q.query).toContain("?delegate-tag-title");
    expect(q.query).toContain("?interaction-block-str");
    expect(q.query).toContain("```");
  });

  it("buildDelegatedPersonRefsQuery finds todo block refs on person or agent pages", () => {
    const q = buildDelegatedPersonRefsQuery();
    expect(q).toContain(":find ?todo-uid ?person-page-title ?person-page-uid");
    expect(q).toContain(":in $ [?todo-uid ...] [?delegate-tag-title ...]");
    expect(q).toContain("[?todo-block :block/uid ?todo-uid]");
    expect(q).toContain("[?ref-block :block/refs ?todo-block]");
    expect(q).toContain("[?ref-block :block/page ?person-page]");
    expect(q).toContain("[?person-page :node/title ?person-page-title]");
    expect(q).toContain("[?delegate-tag-page :node/title ?delegate-tag-title]");
    expect(q).toContain("[?tag-block :block/page ?person-page]");
    expect(q).toContain("[?tag-block :block/refs ?delegate-tag-page]");
  });

  it("buildContextsQuery finds child page refs of TODO+#up blocks", () => {
    const q = buildContextsQuery("up", ["up", "watch", "delegated", "someday"]);
    expect(q.query).toContain(":find ?context-title ?context-uid");
    expect(q.query).toContain("{{[[TODO]]}}");
    expect(q.query).toContain("[?todo-block :block/refs ?up-page]");
    expect(q.query).toContain("[?todo-block :block/children ?child-block]");
    expect(q.query).toContain("[?child-block :block/refs ?context-page]");
    expect(q.query).toContain("[?context-page :node/title ?context-title]");
    for (const tag of ["up", "watch", "delegated", "someday"]) {
      expect(q.query).toContain(`"${tag}"`);
    }
    expect(q.query).toContain("(not [?context-page :log/id _])");
    expect(q.inputs).toEqual(["up"]);
  });

  it("buildContextsByRecencyQuery aggregates max edit time for context pages", () => {
    const q = buildContextsByRecencyQuery("up", ["up", "watch", "delegated", "someday"]);
    expect(q.query).toContain(":find ?context-title ?context-uid (max ?edit-time)");
    expect(q.query).toContain("[?child-block :edit/time ?edit-time]");
    expect(q.query).toContain("[?todo-block :block/children ?child-block]");
    expect(q.query).toContain("[?child-block :block/refs ?context-page]");
    expect(q.query).toContain("(not [?context-page :log/id _])");
    expect(q.inputs).toEqual(["up"]);
  });

  it("buildUpTodosWithContextQuery finds #up TODOs and their context children", () => {
    const q = buildUpTodosWithContextQuery("up", ["up", "watch", "delegated", "someday"]);
    expect(q.query).toContain(":find ?todo-uid ?todo-str ?context-title");
    expect(q.query).toContain("{{[[TODO]]}}");
    expect(q.query).toContain("[?todo-block :block/refs ?up-page]");
    expect(q.query).toContain("[?todo-block :block/uid ?todo-uid]");
    expect(q.query).toContain("[?todo-block :block/children ?child-block]");
    expect(q.query).toContain("[?child-block :block/refs ?context-page]");
    expect(q.query).toContain("[?context-page :node/title ?context-title]");
    expect(q.query).toContain("(not [?context-page :log/id _])");
    expect(q.inputs).toEqual(["up"]);
  });

  it("buildAllUpTodoUidsQuery returns UIDs of all TODO+#up blocks", () => {
    const q = buildAllUpTodoUidsQuery("up");
    expect(q.query).toContain(":find ?todo-uid");
    expect(q.query).toContain("{{[[TODO]]}}");
    expect(q.query).toContain("[?todo-block :block/refs ?up-page]");
    expect(q.query).toContain("[?todo-block :block/uid ?todo-uid]");
    expect(q.inputs).toEqual(["up"]);
  });

  it("buildTicklerQuery scopes Due:: and Reminder:: parent blocks to a month range by log/id", () => {
    const monthStart = toRoamLogId(new Date(2026, 2, 1));
    const monthEnd = toRoamLogId(new Date(2026, 2, 31));
    const q = buildTicklerQuery(monthStart, monthEnd);
    expect(q.inputs).toEqual([monthStart, monthEnd, "up", "watch", "delegated"]);
    expect(q.query).toContain(
      ":find ?parent-uid ?parent-str ?parent-edit-time ?daily-title ?log-id",
    );
    expect(q.query).toContain(":in $ ?month-start ?month-end ?up-tag ?watch-tag ?delegated-tag");
    expect(q.query).toContain("[?parent :block/children ?child]");
    expect(q.query).toContain("(or-join [?child]");
    expect(q.query).toContain('[?due-page :node/title "Due"]');
    expect(q.query).toContain("[?child :block/refs ?due-page]");
    expect(q.query).toContain('[?reminder-page :node/title "Reminder"]');
    expect(q.query).toContain("[?child :block/refs ?reminder-page]");
    expect(q.query).toContain("[?daily-page :log/id ?log-id]");
    expect(q.query).toContain("[(>= ?log-id ?month-start)]");
    expect(q.query).toContain("[(<= ?log-id ?month-end)]");
    expect(q.query).toContain("[?child :block/refs ?daily-page]");
    expect(q.query).toContain("(not [?up-page :node/title ?up-tag]");
    expect(q.query).toContain("(not [?watch-page :node/title ?watch-tag]");
    expect(q.query).toContain("(not [?delegated-page :node/title ?delegated-tag]");
    expect(q.query).toContain('(not [?done-tag :node/title "DONE"]');
    expect(q.query).toContain('(not [?archived-tag :node/title "ARCHIVED"]');
  });

  it("buildTicklerScheduledItemsQuery finds scheduled parents with plain-text Due:: or Reminder:: children", () => {
    const q = buildTicklerScheduledItemsQuery("march", "2026", "up", "watch", "delegated");
    expect(q.inputs).toEqual(["march", "2026", "up", "watch", "delegated"]);
    expect(q.query).toContain(":find ?parent-uid ?parent-str ?parent-edit-time ?child-str");
    expect(q.query).toContain(
      ":in $ ?month-name-lower ?year-fragment ?up-tag ?watch-tag ?delegated-tag",
    );
    expect(q.query).toContain("[?parent :block/children ?child]");
    expect(q.query).toContain("(or-join [?child]");
    expect(q.query).toContain('[?due-page :node/title "Due"]');
    expect(q.query).toContain("[?child :block/refs ?due-page]");
    expect(q.query).toContain('[?reminder-page :node/title "Reminder"]');
    expect(q.query).toContain("[?child :block/refs ?reminder-page]");
    expect(q.query).toContain("clojure.string/includes? ?child-str ?month-name-lower");
    expect(q.query).toContain("clojure.string/includes? ?child-str ?year-fragment");
    expect(q.query).toContain("(not [?child :block/refs ?daily-page]");
    expect(q.query).toContain("[?daily-page :log/id _])");
    expect(q.query).toContain("(not [?up-page :node/title ?up-tag]");
    expect(q.query).toContain("(not [?watch-page :node/title ?watch-tag]");
    expect(q.query).toContain("(not [?delegated-page :node/title ?delegated-tag]");
    expect(q.query).toContain('(not [?done-tag :node/title "DONE"]');
    expect(q.query).toContain('(not [?archived-tag :node/title "ARCHIVED"]');
  });

  it("buildTicklerScheduledPageRefsQuery uses log/id for month-bounded Due:: and Reminder:: refs", () => {
    const monthStart = toRoamLogId(new Date(2026, 2, 1));
    const monthEnd = toRoamLogId(new Date(2026, 2, 31));
    const q = buildTicklerScheduledPageRefsQuery(monthStart, monthEnd, "up", "watch", "delegated");
    expect(q.inputs).toEqual([monthStart, monthEnd, "up", "watch", "delegated"]);
    expect(q.query).toContain(
      ":find ?parent-uid ?parent-str ?parent-edit-time ?daily-title ?log-id",
    );
    expect(q.query).toContain(":in $ ?month-start ?month-end ?up-tag ?watch-tag ?delegated-tag");
    expect(q.query).toContain("[?child :block/refs ?daily-page]");
    expect(q.query).toContain("[?daily-page :log/id ?log-id]");
    expect(q.query).toContain("[(>= ?log-id ?month-start)]");
    expect(q.query).toContain("[(<= ?log-id ?month-end)]");
    expect(q.query).toContain("(not [?up-page :node/title ?up-tag]");
    expect(q.query).toContain("(not [?watch-page :node/title ?watch-tag]");
    expect(q.query).toContain("(not [?delegated-page :node/title ?delegated-tag]");
  });

  it("buildProjectSummaryQuery returns project blocks with optional status blocks", () => {
    const q = buildProjectSummaryQuery();
    expect(q.inputs).toEqual([]);
    expect(q.query).toContain(
      ":find ?project-str ?project-uid ?status-str ?status-uid ?todo-list-uid",
    );
    expect(q.query).toContain('(clojure.string/starts-with? ?project-str "Project::")');
    expect(q.query).toContain("[?project-block :block/uid ?project-uid]");
    expect(q.query).toContain('[?closed-ref :node/title "✅"]');
    expect(q.query).toContain('[?cancelled-ref :node/title "❌"]');
    expect(q.query).toContain("(or-join [?project-block ?status-str ?status-uid]");
    expect(q.query).toContain("(or-join [?project-block ?todo-list-uid]");
    expect(q.query).toContain("[?todo-list-block :block/uid ?todo-list-uid]");
    expect(q.query).toContain('(clojure.string/starts-with? ?status-str "Status::")');
    expect(q.query).toContain("[?status-block :block/uid ?status-uid]");
    expect(q.query).toContain('[(ground "") ?status-str]');
    expect(q.query).toContain('[(ground "") ?status-uid]');
    expect(q.query).toContain('[(ground "") ?todo-list-uid]');
    expect(q.query).not.toContain("log/id");
  });

  it("buildProjectTodoCandidatesQuery scopes TODOs to Todo List descendants with 5-tier priority", () => {
    const q = buildProjectTodoCandidatesQuery("up", "watch", "delegated", "someday");
    expect(q.inputs).toEqual(["up", "delegated", "watch", "someday"]);
    expect(q.query).toContain(":in $ ?up-tag ?delegated-tag ?watch-tag ?someday-tag");
    expect(q.query).toContain("[?project-block :block/uid ?project-uid]");
    expect(q.query).toContain("[?project-block :block/children ?todo-list-block]");
    expect(q.query).toContain("[?todo-list-block :block/string ?todo-list-str]");
    expect(q.query).toContain("[?todo-block :block/parents ?todo-list-block]");
    expect(q.query).toContain("[?todo-block :create/time ?todo-edit-time]");
    expect(q.query).toContain("[?todo-block :block/uid ?todo-uid]");
    expect(q.query).toContain("[(ground 4) ?priority]");
    expect(q.query).toContain("[(ground 3) ?priority]");
    expect(q.query).toContain("[(ground 2) ?priority]");
    expect(q.query).toContain("[(ground 1) ?priority]");
    expect(q.query).toContain("[(ground 0) ?priority]");
  });

  it("buildActiveProjectEntityIdsQuery returns entity IDs without closed or cancelled projects", () => {
    const { inputs, query } = buildActiveProjectEntityIdsQuery();
    expect(inputs).toEqual([]);
    expect(query).toContain("Project::");
    expect(query).toContain("✅");
    expect(query).toContain("❌");
    expect(query).toMatch(/:find\s+\?pb/);
  });

  describe("buildTriageBlockEntityIdsQuery", () => {
    it("returns a lifetime query when no cutoff is provided", () => {
      const { inputs, query } = buildTriageBlockEntityIdsQuery("Triage");
      expect(inputs).toEqual(["Triage"]);
      expect(query).toMatch(/:find\s+\?triage-parent/);
      expect(query).toContain("log/id");
      expect(query).not.toContain("cutoff");
    });

    it("returns a filtered query when cutoff is provided", () => {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const { inputs, query } = buildTriageBlockEntityIdsQuery("Triage", cutoff);
      expect(inputs).toEqual(["Triage", cutoff]);
      expect(query).toContain("cutoff");
      expect(query).toContain(">= ?log-id");
    });
  });
});

describe("getMonthLogIdRange", () => {
  it("returns start and end log IDs for a regular month", () => {
    // March 2026
    const result = getMonthLogIdRange(new Date(2026, 2, 15));
    expect(result.start).toBe(toRoamLogId(new Date(2026, 2, 1)));
    expect(result.end).toBe(toRoamLogId(new Date(2026, 2, 31)));
  });

  it("handles February in a non-leap year", () => {
    // February 2025 (non-leap year: 28 days)
    const result = getMonthLogIdRange(new Date(2025, 1, 10));
    expect(result.start).toBe(toRoamLogId(new Date(2025, 1, 1)));
    expect(result.end).toBe(toRoamLogId(new Date(2025, 1, 28)));
  });

  it("handles February in a leap year", () => {
    // February 2024 (leap year: 29 days)
    const result = getMonthLogIdRange(new Date(2024, 1, 10));
    expect(result.start).toBe(toRoamLogId(new Date(2024, 1, 1)));
    expect(result.end).toBe(toRoamLogId(new Date(2024, 1, 29)));
  });

  it("handles January (month boundary)", () => {
    const result = getMonthLogIdRange(new Date(2026, 0, 1));
    expect(result.start).toBe(toRoamLogId(new Date(2026, 0, 1)));
    expect(result.end).toBe(toRoamLogId(new Date(2026, 0, 31)));
  });

  it("handles December (month boundary)", () => {
    const result = getMonthLogIdRange(new Date(2026, 11, 25));
    expect(result.start).toBe(toRoamLogId(new Date(2026, 11, 1)));
    expect(result.end).toBe(toRoamLogId(new Date(2026, 11, 31)));
  });
});
