import { describe, expect, it } from "vitest";

import {
  buildTagTitleCandidates,
  extractPersonTags,
  findPeopleInText,
  findPersonInText,
} from "../people/text";

describe("people text helpers", () => {
  it("extracts bracket and capitalized simple tags without GTD markers", () => {
    expect(
      extractPersonTags("Talk to #[[Alice Jones]] and #Bob about #up before [[Later]]"),
    ).toEqual(["Alice Jones", "Bob"]);
  });

  it("matches only known people across tag and page-ref forms", () => {
    const people = [
      { title: "Alice", uid: "alice-uid" },
      { title: "Bob Smith", uid: "bob-uid" },
    ];

    expect(findPeopleInText("Ping #[[Alice]] and [[Bob Smith]] and [[Unknown]]", people)).toEqual([
      { title: "Alice", uid: "alice-uid" },
      { title: "Bob Smith", uid: "bob-uid" },
    ]);
    expect(findPersonInText("Follow up with [[Bob Smith]]", people)).toEqual({
      title: "Bob Smith",
      uid: "bob-uid",
    });
  });

  it("builds normalized title candidates for tag lookups", () => {
    expect(buildTagTitleCandidates("#[[ai agents]]")).toEqual(
      expect.arrayContaining(["ai agents", "Ai Agents", "ai agents"]),
    );
  });
});
