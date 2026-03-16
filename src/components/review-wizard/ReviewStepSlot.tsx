import React from "react";

import type { ReviewStepSlotSnapshot } from "../../review/session/types";

export function ReviewStepSlot(args: {
  children?: React.ReactNode;
  onRetry?: () => void;
  snapshot: ReviewStepSlotSnapshot;
}) {
  if (args.snapshot.mode === "error") {
    return (
      <button onClick={args.onRetry} type="button">
        Retry
      </button>
    );
  }

  if (args.snapshot.mode === "loading") {
    return <div data-testid="review-step-loading" style={{ display: "contents" }} />;
  }

  return <>{args.children ?? null}</>;
}
