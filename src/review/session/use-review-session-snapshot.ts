import { useEffect, useState } from "react";

import type { ReviewSession, ReviewSessionSnapshot } from "./types";

export function useReviewSessionSnapshot(session: ReviewSession): ReviewSessionSnapshot {
  const [state, setState] = useState(() => ({
    session,
    snapshot: session.getSnapshot(),
  }));

  const snapshot = state.session === session ? state.snapshot : session.getSnapshot();

  useEffect(() => {
    return session.subscribe(() => {
      setState({
        session,
        snapshot: session.getSnapshot(),
      });
    });
  }, [session]);

  return snapshot;
}
