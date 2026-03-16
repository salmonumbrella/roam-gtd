import React from "react";

import { WeeklyReviewNativeBlock } from "./WeeklyReviewNativeBlock";

interface ReviewPageBlockProps {
  className?: string;
  pageUid: string;
  style?: React.CSSProperties;
}

export function ReviewPageBlock({ className, pageUid, style }: ReviewPageBlockProps) {
  return <WeeklyReviewNativeBlock className={className} open style={style} uid={pageUid} />;
}
