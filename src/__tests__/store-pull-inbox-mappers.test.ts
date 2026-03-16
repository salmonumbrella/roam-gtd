import { describe, expect, it } from "vitest";

import type { PulledBlockChild } from "../store/query-mappers";
import { mapPulledInboxItems } from "../store/query-mappers";

const EXCLUDE_TAGS = ["#up", "#watch", "#delegated", "#someday"];

function makeTriageBlock(children: Array<Partial<PulledBlockChild>>) {
  return {
    ":block/children": children.map((c) => ({
      ":block/string": c[":block/string"] ?? "",
      ":block/uid": c[":block/uid"] ?? "uid",
      ...c,
    })),
    ":block/page": { ":node/title": "March 14th, 2026" },
    ":block/string": "Triage",
    ":block/uid": "triage-1",
  };
}

describe("mapPulledInboxItems", () => {
  it("extracts TODO items with uid, text, pageTitle, createdTime", () => {
    const result = mapPulledInboxItems(
      [
        makeTriageBlock([
          {
            ":block/refs": [{ ":node/title": "TODO" }],
            ":block/string": "{{[[TODO]]}} Buy groceries",
            ":block/uid": "t1",
            ":create/time": 5000,
          },
        ]),
      ],
      EXCLUDE_TAGS,
    );
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe("t1");
    expect(result[0].text).toBe("{{[[TODO]]}} Buy groceries");
    expect(result[0].pageTitle).toBe("March 14th, 2026");
    expect(result[0].createdTime).toBe(5000);
  });

  it("filters out non-TODO children", () => {
    const result = mapPulledInboxItems(
      [
        makeTriageBlock([
          { ":block/refs": [], ":block/string": "Just a note", ":block/uid": "n1" },
          {
            ":block/refs": [{ ":node/title": "TODO" }],
            ":block/string": "{{[[TODO]]}} Real task",
            ":block/uid": "t1",
            ":create/time": 1000,
          },
        ]),
      ],
      EXCLUDE_TAGS,
    );
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe("t1");
  });

  it("filters out DONE and ARCHIVED items", () => {
    const result = mapPulledInboxItems(
      [
        makeTriageBlock([
          {
            ":block/refs": [{ ":node/title": "DONE" }],
            ":block/string": "{{[[DONE]]}} Finished",
            ":block/uid": "d1",
          },
          {
            ":block/refs": [{ ":node/title": "ARCHIVED" }],
            ":block/string": "{{[[ARCHIVED]]}} Old",
            ":block/uid": "a1",
          },
        ]),
      ],
      EXCLUDE_TAGS,
    );
    expect(result).toHaveLength(0);
  });

  it("filters out items with excluded tags", () => {
    const result = mapPulledInboxItems(
      [
        makeTriageBlock([
          {
            ":block/refs": [{ ":node/title": "TODO" }, { ":node/title": "#up" }],
            ":block/string": "{{[[TODO]]}} Tagged",
            ":block/uid": "t1",
            ":create/time": 1000,
          },
          {
            ":block/refs": [{ ":node/title": "TODO" }],
            ":block/string": "{{[[TODO]]}} Untagged",
            ":block/uid": "t2",
            ":create/time": 2000,
          },
        ]),
      ],
      EXCLUDE_TAGS,
    );
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe("t2");
  });

  it("sorts by create time descending", () => {
    const result = mapPulledInboxItems(
      [
        makeTriageBlock([
          {
            ":block/refs": [{ ":node/title": "TODO" }],
            ":block/string": "{{[[TODO]]}} Old",
            ":block/uid": "t1",
            ":create/time": 1000,
          },
          {
            ":block/refs": [{ ":node/title": "TODO" }],
            ":block/string": "{{[[TODO]]}} New",
            ":block/uid": "t2",
            ":create/time": 5000,
          },
        ]),
      ],
      EXCLUDE_TAGS,
    );
    expect(result[0].uid).toBe("t2");
    expect(result[1].uid).toBe("t1");
  });

  it("handles empty input", () => {
    expect(mapPulledInboxItems([], EXCLUDE_TAGS)).toEqual([]);
  });

  it("merges items from multiple Triage blocks", () => {
    const block1 = makeTriageBlock([
      {
        ":block/refs": [{ ":node/title": "TODO" }],
        ":block/string": "{{[[TODO]]}} From day 1",
        ":block/uid": "t1",
        ":create/time": 1000,
      },
    ]);
    const block2 = {
      ...makeTriageBlock([
        {
          ":block/refs": [{ ":node/title": "TODO" }],
          ":block/string": "{{[[TODO]]}} From day 2",
          ":block/uid": "t2",
          ":create/time": 2000,
        },
      ]),
      ":block/page": { ":node/title": "March 13th, 2026" },
    };
    const result = mapPulledInboxItems([block1, block2], EXCLUDE_TAGS);
    expect(result).toHaveLength(2);
    expect(result[0].uid).toBe("t2"); // newer first
  });
});
