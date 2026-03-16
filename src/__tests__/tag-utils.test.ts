import { describe, expect, it } from "vitest";

import { extractHashTags, hasWorkflowTag } from "../tag-utils";

describe("hasWorkflowTag", () => {
  it("matches plain hashtag references", () => {
    expect(hasWorkflowTag("{{[[TODO]]}} do this #up", "up")).toBe(true);
    expect(hasWorkflowTag("{{[[TODO]]}} do this #UP", "up")).toBe(true);
  });

  it("matches bracketed hashtag references", () => {
    expect(hasWorkflowTag("{{[[TODO]]}} do this #[[watch]]", "watch")).toBe(true);
  });

  it("does not match bare links", () => {
    expect(hasWorkflowTag("{{[[TODO]]}} read [[someday]] notes", "someday")).toBe(false);
  });

  it("does not match partial hashtag prefixes", () => {
    expect(hasWorkflowTag("{{[[TODO]]}} finish #update docs", "up")).toBe(false);
    expect(hasWorkflowTag("{{[[TODO]]}} finish #watching", "watch")).toBe(false);
  });
});

describe("extractHashTags", () => {
  it("extracts both #[[Tag]] and #tag forms in order", () => {
    expect(extractHashTags("{{[[TODO]]}} #up #[[Home]] #Errands")).toEqual([
      "Home",
      "up",
      "Errands",
    ]);
  });

  it("deduplicates tags case-insensitively", () => {
    expect(extractHashTags("{{[[TODO]]}} #up #[[UP]] #Up")).toEqual(["UP"]);
  });
});
