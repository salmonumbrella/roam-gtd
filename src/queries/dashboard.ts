import type { QueryDef } from "./types";

export function buildProjectCompletionHistoryQuery(projectUids: Array<string>): QueryDef {
  return {
    inputs: [projectUids],
    query: `
      [:find ?project-uid ?todo-uid ?create-time ?edit-time ?is-done
       :in $ [?project-uid ...]
       :where
         [?project-block :block/uid ?project-uid]
         [?project-block :block/string ?project-str]
         [(clojure.string/starts-with? ?project-str "Project::")]
         [?project-block :block/children ?todo-list-block]
         [?todo-list-block :block/string ?todo-list-str]
         (or
           [(clojure.string/starts-with? ?todo-list-str "Todo List::")]
           [(clojure.string/includes? ?todo-list-str "[[Todo List]]")])
         [?todo-list-block :block/children ?todo-block]
         [?todo-block :block/uid ?todo-uid]
         [?todo-block :create/time ?create-time]
         (or-join [?todo-block ?edit-time ?is-done]
           (and
             [?done-ref :node/title "DONE"]
             [?todo-block :block/refs ?done-ref]
             [?todo-block :edit/time ?edit-time]
             [(ground 1) ?is-done])
           (and
             [?archived-ref :node/title "ARCHIVED"]
             [?todo-block :block/refs ?archived-ref]
             [?todo-block :edit/time ?edit-time]
             [(ground 1) ?is-done])
           (and
             [?todo-ref :node/title "TODO"]
             [?todo-block :block/refs ?todo-ref]
             [(ground 0) ?edit-time]
             [(ground 0) ?is-done]))]
    `,
  };
}

export function buildRecentlyCompletedProjectsQuery(
  weekStartTimestamp: number,
  weekEndTimestamp: number,
): QueryDef {
  return {
    inputs: [weekStartTimestamp, weekEndTimestamp],
    query: `
      [:find ?project-uid ?project-title ?edit-time
       :in $ ?week-start ?week-end
       :where
         [?project-block :block/string ?project-str]
         [(clojure.string/starts-with? ?project-str "Project::")]
         [?project-block :block/uid ?project-uid]
         [?project-block :block/children ?status-block]
         [?status-block :block/string ?status-str]
         [(clojure.string/starts-with? ?status-str "Status::")]
         [?status-block :edit/time ?edit-time]
         [(>= ?edit-time ?week-start)]
         [(< ?edit-time ?week-end)]
         (or-join [?status-block]
           (and [?complete-ref :node/title "✅"] [?status-block :block/refs ?complete-ref])
           (and [?complete-ref :node/title "checkmark"] [?status-block :block/refs ?complete-ref]))
         [?project-block :block/page ?project-page]
         [?project-page :node/title ?project-title]]
    `,
  };
}
