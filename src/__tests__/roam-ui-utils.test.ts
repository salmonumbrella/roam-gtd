import { describe, expect, it, vi } from "vitest";

import { openInSidebar } from "../roam-ui-utils";

describe("openInSidebar", () => {
  it("opens the given block uid in the right sidebar", () => {
    const addWindow = vi.fn();
    vi.stubGlobal("window", {
      roamAlphaAPI: {
        ui: {
          rightSidebar: {
            addWindow,
          },
        },
      },
    });

    openInSidebar("block-uid");

    expect(addWindow).toHaveBeenCalledWith({
      window: { "block-uid": "block-uid", type: "block" },
    });
  });
});
