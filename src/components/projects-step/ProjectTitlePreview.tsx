import React, { useMemo } from "react";

import {
  getProjectTitlePageRefParts,
  parseProjectTitlePreviewText,
} from "../../projects-step/support";

function ProjectTitleInlineRef({ text, type }: { text: string; type: "pageRef" | "tagRef" }) {
  const parts = getProjectTitlePageRefParts(text);
  return (
    <span
      className={`rm-page-ref${type === "tagRef" ? " rm-page-ref--tag" : ""}`}
      data-link-title={text}
      data-tag={type === "tagRef" ? text : undefined}
    >
      {parts.namespace ? (
        <span className="rm-page-ref--namespace">{parts.title}</span>
      ) : (
        <span className="rm-page-ref--link">{parts.title}</span>
      )}
    </span>
  );
}

export function ProjectTitlePreview({ source }: { source?: string | null }) {
  const tokens = useMemo(() => parseProjectTitlePreviewText(source), [source]);
  if (tokens.length === 0) {
    return null;
  }

  return (
    <>
      {tokens.map((token, index) => {
        const key = `${token.type}-${index}`;
        if (token.type === "text") {
          return <React.Fragment key={key}>{token.text}</React.Fragment>;
        }
        return <ProjectTitleInlineRef key={key} text={token.text} type={token.type} />;
      })}
    </>
  );
}
