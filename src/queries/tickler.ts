import type { QueryDef } from "./types";

export function buildTicklerQuery(monthStartLogId: number, monthEndLogId: number): QueryDef {
  return buildTicklerScheduledPageRefsQuery(
    monthStartLogId,
    monthEndLogId,
    "up",
    "watch",
    "delegated",
  );
}

export function buildTicklerScheduledPageRefsQuery(
  monthStartLogId: number,
  monthEndLogId: number,
  nextActionTag: string,
  waitingTag: string,
  delegatedTag: string,
): QueryDef {
  return {
    inputs: [monthStartLogId, monthEndLogId, nextActionTag, waitingTag, delegatedTag],
    query: `
      [:find ?parent-uid ?parent-str ?parent-edit-time ?daily-title ?log-id
       :in $ ?month-start ?month-end ?up-tag ?watch-tag ?delegated-tag
       :where
         [?parent :block/children ?child]
         [?parent :block/uid ?parent-uid]
         [?parent :block/string ?parent-str]
         [?parent :create/time ?parent-edit-time]
         (or-join [?child]
           (and [?due-page :node/title "Due"]
                [?child :block/refs ?due-page])
           (and [?reminder-page :node/title "Reminder"]
                [?child :block/refs ?reminder-page]))
         [?child :block/refs ?daily-page]
         [?daily-page :log/id ?log-id]
         [(>= ?log-id ?month-start)]
         [(<= ?log-id ?month-end)]
         [?daily-page :node/title ?daily-title]
         (not [?up-page :node/title ?up-tag]
              [?parent :block/refs ?up-page])
         (not [?watch-page :node/title ?watch-tag]
              [?parent :block/refs ?watch-page])
         (not [?delegated-page :node/title ?delegated-tag]
              [?parent :block/refs ?delegated-page])
         (not [?done-tag :node/title "DONE"]
              [?parent :block/refs ?done-tag])
         (not [?archived-tag :node/title "ARCHIVED"]
              [?parent :block/refs ?archived-tag])]
    `,
  };
}

export function buildTicklerScheduledItemsQuery(
  monthNameLower: string,
  yearFragment: string,
  nextActionTag: string,
  waitingTag: string,
  delegatedTag: string,
): QueryDef {
  return {
    inputs: [monthNameLower, yearFragment, nextActionTag, waitingTag, delegatedTag],
    query: `
      [:find ?parent-uid ?parent-str ?parent-edit-time ?child-str
       :in $ ?month-name-lower ?year-fragment ?up-tag ?watch-tag ?delegated-tag
       :where
         [?parent :block/children ?child]
         [?parent :block/uid ?parent-uid]
         [?parent :block/string ?parent-str]
         [?parent :create/time ?parent-edit-time]
         [?child :block/string ?child-str]
         (or-join [?child]
           (and [?due-page :node/title "Due"]
                [?child :block/refs ?due-page])
           (and [?reminder-page :node/title "Reminder"]
                [?child :block/refs ?reminder-page]))
         [(clojure.string/includes? ?child-str ?month-name-lower)]
         [(clojure.string/includes? ?child-str ?year-fragment)]
         (not [?child :block/refs ?daily-page]
              [?daily-page :log/id _])
         (not [?up-page :node/title ?up-tag]
              [?parent :block/refs ?up-page])
         (not [?watch-page :node/title ?watch-tag]
              [?parent :block/refs ?watch-page])
         (not [?delegated-page :node/title ?delegated-tag]
              [?parent :block/refs ?delegated-page])
         (not [?done-tag :node/title "DONE"]
              [?parent :block/refs ?done-tag])
         (not [?archived-tag :node/title "ARCHIVED"]
              [?parent :block/refs ?archived-tag])]
    `,
  };
}
