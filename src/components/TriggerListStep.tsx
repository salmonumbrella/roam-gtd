import React, { useMemo } from "react";

import { ReviewPageBlock } from "./ReviewPageBlock";

interface TriggerListStepProps {
  pageName: string;
}

export function TriggerListStep({ pageName }: TriggerListStepProps) {
  const pageUid = useMemo(() => {
    const rows = window.roamAlphaAPI.data.q(
      `[:find ?uid :in $ ?title :where [?p :node/title ?title] [?p :block/uid ?uid]]`,
      pageName,
    );
    return typeof rows?.[0]?.[0] === "string" ? rows[0][0] : null;
  }, [pageName]);

  if (!pageUid) {
    return (
      <p className="bp3-text-muted" style={{ padding: 24, textAlign: "center" }}>
        {`Page [[${pageName}]] not found. Create it in Roam to use the trigger list.`}
      </p>
    );
  }

  return (
    <div>
      <div
        className="roam-gtd-trigger-list"
        style={{
          borderRadius: 4,
          maxHeight: 360,
          overflowY: "auto",
          overscrollBehavior: "contain",
          padding: "8px 4px",
        }}
      >
        <ReviewPageBlock pageUid={pageUid} />
      </div>
    </div>
  );
}
