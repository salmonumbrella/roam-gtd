import type { QueryDef } from "./types";

export function buildProjectsQuery(): QueryDef {
  return {
    inputs: [],
    query: `
      [:find ?page-title ?page-uid (count ?block)
       :where
         [?todo-tag :node/title "TODO"]
         [?block :block/refs ?todo-tag]
         [?block :block/page ?page]
         [?page :node/title ?page-title]
         [?page :block/uid ?page-uid]
         (not [?page :log/id ?page-log-id])]
    `,
  };
}

export function buildActiveProjectsQuery(): QueryDef {
  return {
    inputs: [],
    query: `
      [:find ?page-title ?page-uid
       :where
         [?project-page :node/title "Project"]
         [?project-block :block/string ?project-str]
         (or
           [(clojure.string/starts-with? ?project-str "Project::")]
           [(clojure.string/includes? ?project-str "[[Project]]")])
         [?project-block :block/page ?page]
         [?page :node/title ?page-title]
         [?page :block/uid ?page-uid]
         (not [?page :log/id ?page-log-id])
         (not [?page :node/title "roam/templates"])
         (not [?page :node/title "SmartBlock"])
         [?project-block :block/refs ?project-page]]
    `,
  };
}

export function buildStatusAttributeOptionsQuery(): QueryDef {
  return {
    inputs: [],
    query: `
      [:find ?option-str ?option-order
       :where
         (or-join [?page ?option-str ?option-order]
           (and
             [?page :node/title "roam/js/attribute-select"]
             [?page :block/children ?attributes-block]
             [?attributes-block :block/string "attributes"]
             [?attributes-block :block/children ?status-block]
             [?status-block :block/string "Status"]
             [?status-block :block/children ?options-block]
             [?options-block :block/string "options"]
             [?options-block :block/children ?option-block]
             [?option-block :block/string ?option-str]
             [?option-block :block/order ?option-order])
           (and
             [?page :node/title "roam/render"]
             [?page :block/children ?render-block]
             [?render-block :block/string "attribute-select"]
             [?render-block :block/children ?attributes-block]
             [?attributes-block :block/string "attributes"]
             [?attributes-block :block/children ?status-block]
             [?status-block :block/string "Status"]
             [?status-block :block/children ?options-block]
             [?options-block :block/string "options"]
             [?options-block :block/children ?option-block]
             [?option-block :block/string ?option-str]
             [?option-block :block/order ?option-order]))]
    `,
  };
}

export function buildStatusWorkflowProjectsQuery(): QueryDef {
  return {
    inputs: [],
    query: `
      [:find ?page-title ?project-block-uid ?project-str
       :where
         [?page :block/children ?project-block]
         [?project-block :block/uid ?project-block-uid]
         [?project-block :block/string ?project-str]
         [(clojure.string/starts-with? ?project-str "Project::")]
         [?page :node/title ?page-title]
         [?project-block :block/children ?status-block]
         [?status-block :block/string ?status-str]
         [(clojure.string/starts-with? ?status-str "Status::")]
         (not [?status-block :block/refs ?closed-ref]
              [?closed-ref :node/title "✅"])
         (not [?status-block :block/refs ?cancel-ref]
              [?cancel-ref :node/title "❌"])]
    `,
  };
}

export function buildAllProjectsQuery(): QueryDef {
  return {
    inputs: [],
    query: `
      [:find ?page-title ?project-block-uid ?project-str
       :where
         [?project-block :block/page ?page]
         [?project-block :block/uid ?project-block-uid]
         [?project-block :block/string ?project-str]
         [(clojure.string/starts-with? ?project-str "Project::")]
         [?page :node/title ?page-title]]
    `,
  };
}

export function buildAllProjectsByRecencyQuery(): QueryDef {
  return {
    inputs: [],
    query: `
      [:find ?page-title ?project-block-uid ?project-str (max ?interaction-time)
       :where
         [?project-block :block/page ?page]
         [?project-block :block/uid ?project-block-uid]
         [?project-block :block/string ?project-str]
         [(clojure.string/starts-with? ?project-str "Project::")]
         [?page :node/title ?page-title]
         (or-join [?interaction-block ?project-block]
           [?project-block :block/children ?interaction-block]
           [?interaction-block :block/parents ?project-block]
           [?interaction-block :block/refs ?project-block])
         (or-join [?interaction-block ?interaction-time]
           [?interaction-block :edit/time ?interaction-time]
           [?interaction-block :create/time ?interaction-time])]
    `,
  };
}

export function buildStatusWorkflowProjectsByRecencyQuery(): QueryDef {
  return {
    inputs: [],
    query: `
      [:find ?page-title ?project-block-uid ?project-str (max ?interaction-time)
       :where
         [?page :block/children ?project-block]
         [?project-block :block/uid ?project-block-uid]
         [?project-block :block/string ?project-str]
         [(clojure.string/starts-with? ?project-str "Project::")]
         [?page :node/title ?page-title]
         [?project-block :block/children ?status-block]
         [?status-block :block/string ?status-str]
         [(clojure.string/starts-with? ?status-str "Status::")]
         (not [?status-block :block/refs ?closed-ref]
              [?closed-ref :node/title "✅"])
         (not [?status-block :block/refs ?cancel-ref]
              [?cancel-ref :node/title "❌"])
         (or-join [?interaction-block ?project-block]
           [?project-block :block/children ?interaction-block]
           [?interaction-block :block/parents ?project-block]
           [?interaction-block :block/refs ?project-block])
         (or-join [?interaction-block ?interaction-time]
           [?interaction-block :edit/time ?interaction-time]
           [?interaction-block :create/time ?interaction-time])]
    `,
  };
}

export function buildProjectSummaryQuery(): QueryDef {
  return {
    inputs: [],
    query: `
      [:find ?project-str ?project-uid ?status-str ?status-uid ?todo-list-uid
       :where
         [?project-block :block/string ?project-str]
         [(clojure.string/starts-with? ?project-str "Project::")]
         [?project-block :block/uid ?project-uid]
         (not
           [?project-block :block/children ?closed-status-block]
           [?closed-status-block :block/string ?closed-status-str]
           [(clojure.string/starts-with? ?closed-status-str "Status::")]
           [?closed-status-block :block/refs ?closed-ref]
           [?closed-ref :node/title "✅"])
         (not
           [?project-block :block/children ?cancelled-status-block]
           [?cancelled-status-block :block/string ?cancelled-status-str]
           [(clojure.string/starts-with? ?cancelled-status-str "Status::")]
           [?cancelled-status-block :block/refs ?cancelled-ref]
           [?cancelled-ref :node/title "❌"])
         (or-join [?project-block ?status-str ?status-uid]
           (and
             [?project-block :block/children ?status-block]
             [?status-block :block/string ?status-str]
             [(clojure.string/starts-with? ?status-str "Status::")]
             [?status-block :block/uid ?status-uid])
           (and
             [(ground "") ?status-str]
             [(ground "") ?status-uid]))
         (or-join [?project-block ?todo-list-uid]
           (and
             [?project-block :block/children ?todo-list-block]
             [?todo-list-block :block/string ?todo-list-str]
             (or
               [(clojure.string/starts-with? ?todo-list-str "Todo List::")]
               [(clojure.string/includes? ?todo-list-str "[[Todo List]]")])
             [?todo-list-block :block/uid ?todo-list-uid])
           (and
             [(ground "") ?todo-list-uid]))]
    `,
  };
}

export function buildActiveProjectEntityIdsQuery(): QueryDef {
  return {
    inputs: [],
    query: `
      [:find ?pb
       :where
         [?pb :block/string ?ps]
         [(clojure.string/starts-with? ?ps "Project::")]
         (not
           [?pb :block/children ?csb]
           [?csb :block/string ?css]
           [(clojure.string/starts-with? ?css "Status::")]
           [?csb :block/refs ?cr]
           [?cr :node/title "✅"])
         (not
           [?pb :block/children ?xsb]
           [?xsb :block/string ?xss]
           [(clojure.string/starts-with? ?xss "Status::")]
           [?xsb :block/refs ?xr]
           [?xr :node/title "❌"])]
    `,
  };
}

export function buildProjectTodoCandidatesQuery(
  nextActionTag: string,
  waitingTag: string,
  delegatedTag: string,
  somedayTag: string,
): QueryDef {
  return {
    inputs: [nextActionTag, delegatedTag, waitingTag, somedayTag],
    query: `
      [:find ?project-uid ?todo-uid ?todo-str ?todo-edit-time ?priority
       :in $ ?up-tag ?delegated-tag ?watch-tag ?someday-tag
       :where
         [?project-block :block/string ?project-str]
         [?project-block :block/uid ?project-uid]
         [(clojure.string/starts-with? ?project-str "Project::")]
         [?project-block :block/children ?todo-list-block]
         [?todo-list-block :block/string ?todo-list-str]
         (or
           [(clojure.string/starts-with? ?todo-list-str "Todo List::")]
           [(clojure.string/includes? ?todo-list-str "[[Todo List]]")])
         [?todo-tag :node/title "TODO"]
         [?todo-block :block/refs ?todo-tag]
         [?todo-block :block/parents ?todo-list-block]
         [?todo-block :block/string ?todo-str]
         [?todo-block :block/uid ?todo-uid]
         [?todo-block :create/time ?todo-edit-time]
         (or-join [?todo-block ?up-tag ?delegated-tag ?watch-tag ?someday-tag ?priority]
           (and [?p1 :node/title ?up-tag]       [?todo-block :block/refs ?p1] [(ground 4) ?priority])
           (and [?p2 :node/title ?delegated-tag] [?todo-block :block/refs ?p2] [(ground 3) ?priority])
           (and [?p3 :node/title ?watch-tag]     [?todo-block :block/refs ?p3] [(ground 2) ?priority])
           (and [?p4 :node/title ?someday-tag]   [?todo-block :block/refs ?p4] [(ground 0) ?priority])
           (and [(ground 1) ?priority]))
         (not [?done-tag :node/title "DONE"]
              [?todo-block :block/refs ?done-tag])
         (not [?archived-tag :node/title "ARCHIVED"]
              [?todo-block :block/refs ?archived-tag])]
    `,
  };
}
