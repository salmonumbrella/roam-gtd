import React, { useEffect, useState } from "react";

import {
  ensureReviewPageDetailStyle,
  REVIEW_PAGE_DETAIL_WRAPPER_STYLE,
} from "./review-page-detail-styles";
import { ReviewPageBlock } from "./ReviewPageBlock";

interface ReviewPageDetailPaneProps {
  loadDelayMs?: number;
  pageUid: string;
}

function DetailSkeleton() {
  return (
    <div style={{ padding: "16px 0" }}>
      <div
        className="gtd-skeleton"
        style={{ borderRadius: 4, height: 18, marginBottom: 10, width: "70%" }}
      />
      <div
        className="gtd-skeleton"
        style={{ borderRadius: 4, height: 18, marginBottom: 10, width: "55%" }}
      />
      <div className="gtd-skeleton" style={{ borderRadius: 4, height: 18, width: "40%" }} />
    </div>
  );
}

export function ReviewPageDetailPane({ loadDelayMs = 0, pageUid }: ReviewPageDetailPaneProps) {
  const [readyUid, setReadyUid] = useState<string | null>(loadDelayMs <= 0 ? pageUid : null);

  useEffect(() => {
    ensureReviewPageDetailStyle();
  }, []);

  useEffect(() => {
    if (loadDelayMs <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setReadyUid(pageUid), loadDelayMs);
    return () => window.clearTimeout(timer);
  }, [loadDelayMs, pageUid]);

  const isReady = loadDelayMs <= 0 || readyUid === pageUid;

  return (
    <div style={REVIEW_PAGE_DETAIL_WRAPPER_STYLE}>
      {isReady ? (
        <div className="gtd-project-detail-panel">
          <ReviewPageBlock className="gtd-project-detail-page" pageUid={pageUid} />
        </div>
      ) : (
        <DetailSkeleton />
      )}
    </div>
  );
}
