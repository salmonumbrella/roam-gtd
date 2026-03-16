import type { QueryDef } from "./types";

export function buildPeopleQuery(delegateTagTitles: Array<string>): QueryDef {
  return {
    inputs: [delegateTagTitles],
    query: `
      [:find ?page-title ?page-uid
       :in $ [?delegate-tag-title ...]
       :where
         [?delegate-tag-page :node/title ?delegate-tag-title]
         [?tag-block :block/refs ?delegate-tag-page]
         [?tag-block :block/string ?tag-block-str]
         (not [(clojure.string/includes? ?tag-block-str "\`\`\`")])
         [?tag-block :block/page ?page]
         [?page :node/title ?page-title]
         [?page :block/uid ?page-uid]
         (not [?page :node/title "roam/templates"])
         (not [?page :node/title "SmartBlock"])]
    `,
  };
}

export function buildPeopleByRecencyQuery(delegateTagTitles: Array<string>): QueryDef {
  return {
    inputs: [delegateTagTitles],
    query: `
      [:find ?page-title ?page-uid (max ?interaction-edit-time)
       :in $ [?delegate-tag-title ...]
       :where
         [?delegate-tag-page :node/title ?delegate-tag-title]
         [?tag-block :block/refs ?delegate-tag-page]
         [?tag-block :block/string ?tag-block-str]
         (not [(clojure.string/includes? ?tag-block-str "\`\`\`")])
         [?tag-block :block/page ?page]
         [?page :node/title ?page-title]
         [?page :block/uid ?page-uid]
         (not [?page :node/title "roam/templates"])
         (not [?page :node/title "SmartBlock"])
         (or-join [?interaction-block ?page]
           [?interaction-block :block/page ?page]
           [?interaction-block :block/refs ?page])
         [?interaction-block :block/string ?interaction-block-str]
         (not [(clojure.string/includes? ?interaction-block-str "\`\`\`")])
         [?interaction-block :edit/time ?interaction-edit-time]
         (not [?interaction-page :node/title "roam/templates"]
              [?interaction-block :block/page ?interaction-page])
         (not [?interaction-page-2 :node/title "SmartBlock"]
              [?interaction-block :block/page ?interaction-page-2])]
    `,
  };
}

/**
 * Find person pages that reference the given todo blocks.
 * A todo is "assigned" to a person if a block reference ((todo-uid))
 * exists on a page that is also tagged with one of the delegate target tags
 * (e.g. people, agents).
 * Returns [todoUid, personPageTitle, personPageUid] triples.
 */
export function buildDelegatedPersonRefsQuery(): string {
  return `[:find ?todo-uid ?person-page-title ?person-page-uid
    :in $ [?todo-uid ...] [?delegate-tag-title ...]
    :where
      [?todo-block :block/uid ?todo-uid]
      [?ref-block :block/refs ?todo-block]
      [?ref-block :block/page ?person-page]
      [?person-page :node/title ?person-page-title]
      [?person-page :block/uid ?person-page-uid]
      [?delegate-tag-page :node/title ?delegate-tag-title]
      [?tag-block :block/page ?person-page]
      [?tag-block :block/refs ?delegate-tag-page]]`;
}

export function buildContextsQuery(nextActionTag: string, excludeTags: Array<string>): QueryDef {
  const excludeClauses = excludeTags
    .map((tag) => `(not [(= ?context-title "${tag}")])`)
    .join("\n         ");
  return {
    inputs: [nextActionTag],
    query: `
      [:find ?context-title ?context-uid
       :in $ ?up-tag-title
       :where
         [?up-page :node/title ?up-tag-title]
         [?todo-block :block/string ?todo-str]
         [(clojure.string/includes? ?todo-str "{{[[TODO]]}}")]
         [?todo-block :block/refs ?up-page]
         [?todo-block :block/children ?child-block]
         [?child-block :block/refs ?context-page]
         [?context-page :node/title ?context-title]
         [?context-page :block/uid ?context-uid]
         ${excludeClauses}
         (not [?context-page :node/title "roam/templates"])
         (not [?context-page :node/title "SmartBlock"])
         (not [?context-page :log/id _])]
    `,
  };
}

export function buildContextsByRecencyQuery(
  nextActionTag: string,
  excludeTags: Array<string>,
): QueryDef {
  const excludeClauses = excludeTags
    .map((tag) => `(not [(= ?context-title "${tag}")])`)
    .join("\n         ");
  return {
    inputs: [nextActionTag],
    query: `
      [:find ?context-title ?context-uid (max ?edit-time)
       :in $ ?up-tag-title
       :where
         [?up-page :node/title ?up-tag-title]
         [?todo-block :block/string ?todo-str]
         [(clojure.string/includes? ?todo-str "{{[[TODO]]}}")]
         [?todo-block :block/refs ?up-page]
         [?todo-block :block/children ?child-block]
         [?child-block :block/refs ?context-page]
         [?context-page :node/title ?context-title]
         [?context-page :block/uid ?context-uid]
         [?child-block :edit/time ?edit-time]
         ${excludeClauses}
         (not [?context-page :node/title "roam/templates"])
         (not [?context-page :node/title "SmartBlock"])
         (not [?context-page :log/id _])]
    `,
  };
}

export function buildUpTodosWithContextQuery(
  nextActionTag: string,
  excludeTags: Array<string>,
): QueryDef {
  const excludeClauses = excludeTags
    .map((tag) => `(not [(= ?context-title "${tag}")])`)
    .join("\n         ");
  return {
    inputs: [nextActionTag],
    query: `
      [:find ?todo-uid ?todo-str ?context-title
       :in $ ?up-tag-title
       :where
         [?up-page :node/title ?up-tag-title]
         [?todo-block :block/string ?todo-str]
         [(clojure.string/includes? ?todo-str "{{[[TODO]]}}")]
         [?todo-block :block/refs ?up-page]
         [?todo-block :block/uid ?todo-uid]
         [?todo-block :block/children ?child-block]
         [?child-block :block/refs ?context-page]
         [?context-page :node/title ?context-title]
         ${excludeClauses}
         (not [?context-page :node/title "roam/templates"])
         (not [?context-page :node/title "SmartBlock"])
         (not [?context-page :log/id _])]
    `,
  };
}

export function buildAllUpTodoUidsQuery(nextActionTag: string): QueryDef {
  return {
    inputs: [nextActionTag],
    query: `
      [:find ?todo-uid
       :in $ ?up-tag-title
       :where
         [?up-page :node/title ?up-tag-title]
         [?todo-block :block/string ?todo-str]
         [(clojure.string/includes? ?todo-str "{{[[TODO]]}}")]
         [?todo-block :block/refs ?up-page]
         [?todo-block :block/uid ?todo-uid]]
    `,
  };
}
