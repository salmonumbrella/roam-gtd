import { describe, expect, it } from "vitest";

import {
  buildTagTitleCandidates,
  extractPersonTags,
  findPeopleInText,
  findPersonInText,
} from "../people";

describe("extractPersonTags", () => {
  it("extracts #[[Person Name]] tags from text", () => {
    const result = extractPersonTags("Task for #[[Jane Cooper]] to review");
    expect(result).toEqual(["Jane Cooper"]);
  });

  it("extracts multiple person tags", () => {
    const result = extractPersonTags("Call #[[Alice]] and #[[Bob Smith]]");
    expect(result).toEqual(["Alice", "Bob Smith"]);
  });

  it("returns empty array when no person tags", () => {
    const result = extractPersonTags("Just a regular task #up");
    expect(result).toEqual([]);
  });

  it("handles #Tag form without brackets", () => {
    const result = extractPersonTags("Talk to #Alice about project");
    expect(result).toEqual(["Alice"]);
  });
});

describe("findPersonInText", () => {
  it("returns first matching person from known people list", () => {
    const people = [
      { title: "Jane Cooper", uid: "abc123" },
      { title: "Alice", uid: "def456" },
    ];
    const result = findPersonInText("Task for #[[Jane Cooper]]", people);
    expect(result).toEqual({ title: "Jane Cooper", uid: "abc123" });
  });

  it("returns null when no known person found", () => {
    const people = [{ title: "Jane Cooper", uid: "abc123" }];
    const result = findPersonInText("Task with #[[Unknown Person]]", people);
    expect(result).toBeNull();
  });

  it("returns null when text has no person tags", () => {
    const people = [{ title: "Alice", uid: "abc123" }];
    const result = findPersonInText("Just a task", people);
    expect(result).toBeNull();
  });
});

describe("buildTagTitleCandidates", () => {
  it("title-cases each word in a multi-word tag", () => {
    const candidates = buildTagTitleCandidates("#[[ai agents]]");
    expect(candidates).toContain("Ai Agents");
  });

  it("returns original, lowercase, and title-cased variants", () => {
    const candidates = buildTagTitleCandidates("#Alice");
    expect(candidates).toContain("Alice");
    expect(candidates).toContain("alice");
  });

  it("returns empty array for empty input", () => {
    expect(buildTagTitleCandidates("")).toEqual([]);
  });
});

describe("findPeopleInText", () => {
  const people = [
    { title: "Jane Cooper", uid: "abc123" },
    { title: "Alice", uid: "def456" },
  ];

  it("matches plain page refs like [[Person]] against known people", () => {
    expect(findPeopleInText("Task for [[Jane Cooper]]", people)).toEqual([
      { title: "Jane Cooper", uid: "abc123" },
    ]);
  });

  it("matches both hashtag and non-hashtag refs without duplicates", () => {
    expect(findPeopleInText("Talk to #[[Alice]] and [[Alice]]", people)).toEqual([
      { title: "Alice", uid: "def456" },
    ]);
  });

  it("returns only pages that exist in known people", () => {
    expect(findPeopleInText("Discuss with [[Unknown]] and [[Alice]]", people)).toEqual([
      { title: "Alice", uid: "def456" },
    ]);
  });
});
