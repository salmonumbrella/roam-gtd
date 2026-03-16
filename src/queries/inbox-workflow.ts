import type { QueryDef } from "./types";

export function buildTodosByTagsQuery(tagTitles: Array<string>): QueryDef {
  return {
    inputs: [tagTitles],
    query: `
      [:find ?uid ?s ?page-title ?edit-time ?tag-title
       :in $ [?tag-title ...]
       :where
         [?todo-tag :node/title "TODO"]
         [?block :block/refs ?todo-tag]
         [?block :block/string ?s]
         [?block :block/uid ?uid]
         [?block :create/time ?edit-time]
         [?tag-page :node/title ?tag-title]
         [?block :block/refs ?tag-page]
         [?block :block/page ?page]
         [?page :node/title ?page-title]
         (not [?done-tag :node/title "DONE"]
              [?block :block/refs ?done-tag])
         (not [?archived-tag :node/title "ARCHIVED"]
              [?block :block/refs ?archived-tag])]
    `,
  };
}

export function buildInboxQuery(triageTitle: string, excludeTags: Array<string>): QueryDef {
  const inParams = excludeTags.map((_, i) => `?ex-tag-${i}`).join(" ");
  const notClauses = excludeTags
    .map(
      (_, i) => `(not [?ex-page-${i} :node/title ?ex-tag-${i}] [?block :block/refs ?ex-page-${i}])`,
    )
    .join("\n         ");

  return {
    inputs: [triageTitle, ...excludeTags],
    query: `
      [:find ?uid ?s ?page-title ?edit-time
       :in $ ?triage-title ${inParams}
       :where
         [?triage-page :node/title ?triage-title]
         [?todo-tag :node/title "TODO"]
         [?block :block/refs ?todo-tag]
         [?block :block/string ?s]
         [?block :block/uid ?uid]
         [?block :create/time ?edit-time]
         [?block :block/page ?page]
         [?page :node/title ?page-title]
         (or-join [?block ?page ?triage-page]
           [?block :block/refs ?triage-page]
           (and [?triage-parent :block/refs ?triage-page]
                [?triage-parent :block/children ?block])
           (and [?block :block/parents ?ancestor]
                [?ancestor :block/refs ?triage-page])
           [(= ?page ?triage-page)])
         (not [?block :block/parents ?project-ancestor]
              [?project-ancestor :block/string ?project-ancestor-str]
              [(clojure.string/starts-with? ?project-ancestor-str "Project::")])
         (not [?done-tag :node/title "DONE"]
              [?block :block/refs ?done-tag])
         (not [?archived-tag :node/title "ARCHIVED"]
              [?block :block/refs ?archived-tag])
         ${notClauses}]
    `,
  };
}

export function buildStaleQuery(cutoffTimestamp: number, todayLogId: number): QueryDef {
  return {
    inputs: [cutoffTimestamp, todayLogId],
    query: `
      [:find ?uid ?s ?page-title ?edit-time
       :in $ ?cutoff ?today-log-id
       :where
         [?todo-tag :node/title "TODO"]
         [?block :block/refs ?todo-tag]
         [?block :block/string ?s]
         [?block :block/uid ?uid]
         [?block :create/time ?edit-time]
         [(< ?edit-time ?cutoff)]
         [?block :block/page ?page]
         [?page :node/title ?page-title]
         (not [?page :log/id ?page-log-id]
              [(> ?page-log-id ?today-log-id)])]
    `,
  };
}

export function buildDeferredByTagsQuery(tagTitles: Array<string>): QueryDef {
  return {
    inputs: [tagTitles],
    query: `
      [:find ?uid ?s ?page-title ?date-title ?edit-time ?tag-title
       :in $ [?tag-title ...]
       :where
         [?todo-tag :node/title "TODO"]
         [?block :block/refs ?todo-tag]
         [?block :block/string ?s]
         [?block :block/uid ?uid]
         [?block :create/time ?edit-time]
         [?tag-page :node/title ?tag-title]
         [?block :block/refs ?tag-page]
         [?block :block/refs ?date-page]
         [?date-page :log/id ?date-log-id]
         [?date-page :node/title ?date-title]
         [?block :block/page ?page]
         [?page :node/title ?page-title]]
    `,
  };
}

export function buildTopGoalsQuery(attrName: string): QueryDef {
  return {
    inputs: [attrName],
    query: `
      [:find ?uid ?s ?page-title
       :in $ ?attr-name
       :where
         [?attr-page :node/title ?attr-name]
         [?block :block/refs ?attr-page]
         [?block :block/string ?s]
         [?block :block/uid ?uid]
         [?block :block/page ?page]
         [?page :log/id ?page-log-id]
         [?page :node/title ?page-title]
       ]
    `,
  };
}

export function buildTriageBlockEntityIdsQuery(triageTitle: string, cutoffMs?: number): QueryDef {
  if (cutoffMs != null) {
    return {
      inputs: [triageTitle, cutoffMs],
      query: `
        [:find ?triage-parent
         :in $ ?triage-title ?cutoff
         :where
           [?triage-page :node/title ?triage-title]
           [?triage-parent :block/refs ?triage-page]
           [?triage-parent :block/page ?page]
           [?page :log/id ?log-id]
           [(>= ?log-id ?cutoff)]]
      `,
    };
  }
  return {
    inputs: [triageTitle],
    query: `
      [:find ?triage-parent
       :in $ ?triage-title
       :where
         [?triage-page :node/title ?triage-title]
         [?triage-parent :block/refs ?triage-page]
         [?triage-parent :block/page ?page]
         [?page :log/id _]]
    `,
  };
}

export function buildTriagedThisWeekQuery(
  triageTitle: string,
  gtdTags: Array<string>,
  weekStartTimestamp: number,
): QueryDef {
  const tagBindings = gtdTags.map((_, i) => `?gtd-tag-${i}`).join(" ");
  const tagClauses = gtdTags
    .map(
      (_, i) =>
        `(and [?gtd-page-${i} :node/title ?gtd-tag-${i}] [?block :block/refs ?gtd-page-${i}])`,
    )
    .join("\n             ");

  return {
    inputs: [triageTitle, weekStartTimestamp, ...gtdTags],
    query: `
      [:find ?uid
       :in $ ?triage-title ?week-start ${tagBindings}
       :where
         [?block :block/uid ?uid]
         [?block :create/time ?create-time]
         [(>= ?create-time ?week-start)]
         [?triage-page :node/title ?triage-title]
         (or-join [?block ?triage-page]
           [?block :block/refs ?triage-page]
           (and [?triage-parent :block/refs ?triage-page]
                [?triage-parent :block/children ?block])
           (and [?block :block/parents ?ancestor]
                [?ancestor :block/refs ?triage-page])
           [?block :block/page ?triage-page])
         (or-join [?block]
           (and [?done-tag :node/title "DONE"]
                [?block :block/refs ?done-tag])
           (and [?archived-tag :node/title "ARCHIVED"]
                [?block :block/refs ?archived-tag])
           ${tagClauses})]
    `,
  };
}

export function buildCompletedThisWeekQuery(
  weekStartTimestamp: number,
  weekEndTimestamp: number,
): QueryDef {
  return {
    inputs: [weekStartTimestamp, weekEndTimestamp],
    query: `
      [:find ?uid ?s ?page-title ?create-time ?edit-time
       :in $ ?week-start ?week-end
       :where
         [?block :block/string ?s]
         [?block :block/uid ?uid]
         [?block :block/page ?page]
         [?page :node/title ?page-title]
         [?block :create/time ?create-time]
         [?block :edit/time ?edit-time]
         [(>= ?edit-time ?week-start)]
         [(< ?edit-time ?week-end)]
         (or-join [?block]
           (and [?done-tag :node/title "DONE"]
                [?block :block/refs ?done-tag])
           (and [?archived-tag :node/title "ARCHIVED"]
                [?block :block/refs ?archived-tag]))]
    `,
  };
}
