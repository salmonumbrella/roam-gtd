import { describe, expect, it } from "vitest";

import { getUnifiedReviewRowStaticText } from "../components/UnifiedReviewRow";

describe("getUnifiedReviewRowStaticText", () => {
  it("strips workflow tags and Roam markup for the lightweight Step 3 preview", () => {
    expect(
      getUnifiedReviewRowStaticText(
        "{{[[TODO]]}} Review [[Project Alpha]] with [notes](((abc123xyz))) #up #[[watch]] ((blockref))",
        ["up", "watch"],
      ),
    ).toBe("Review Project Alpha with notes");
  });
});
