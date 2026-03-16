import type { ProjectSummary } from "../../types";

export type ProjectTitlePreviewToken =
  | { text: string; type: "pageRef" }
  | { text: string; type: "tagRef" }
  | { text: string; type: "text" };

const PROJECT_TITLE_PREVIEW_PATTERN =
  /#\[\[([^\]]+)\]\]|\[\[([^\]]+)\]\]|(^|[\s(])#([A-Za-z0-9_/-]+)/g;

export function getProjectPagePreviewSource(project: Pick<ProjectSummary, "pageTitle">): string {
  const rawTitle = project.pageTitle?.trim() ?? "";
  return rawTitle.replace(/^Project::\s*/i, "").trim() || rawTitle;
}

export function getProjectTitlePageRefParts(title: string): {
  namespace: string | null;
  title: string;
} {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    return {
      namespace: null,
      title: "",
    };
  }
  if (!trimmedTitle.includes("/") || trimmedTitle.includes("://")) {
    return {
      namespace: null,
      title: trimmedTitle,
    };
  }
  const lastSeparatorIndex = trimmedTitle.lastIndexOf("/");
  const namespace = trimmedTitle.slice(0, lastSeparatorIndex).trim();
  if (!namespace || namespace.includes(" ")) {
    return {
      namespace: null,
      title: trimmedTitle,
    };
  }
  const displayTitle = trimmedTitle.slice(lastSeparatorIndex + 1).trim() || trimmedTitle;
  return {
    namespace,
    title: displayTitle,
  };
}

export function parseProjectTitlePreviewText(
  source?: string | null,
): Array<ProjectTitlePreviewToken> {
  const value = source?.trim();
  if (!value) {
    return [];
  }

  const tokens: Array<ProjectTitlePreviewToken> = [];
  let cursor = 0;

  for (const match of value.matchAll(PROJECT_TITLE_PREVIEW_PATTERN)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > cursor) {
      tokens.push({ text: value.slice(cursor, matchIndex), type: "text" });
    }

    const plainTagPrefix = match[3] ?? "";
    if (plainTagPrefix) {
      tokens.push({ text: plainTagPrefix, type: "text" });
    }

    if (match[1]) {
      tokens.push({ text: match[1], type: "tagRef" });
    } else if (match[2]) {
      tokens.push({ text: match[2], type: "pageRef" });
    } else if (match[4]) {
      tokens.push({ text: match[4], type: "tagRef" });
    }

    cursor = matchIndex + match[0].length;
  }

  if (cursor < value.length) {
    tokens.push({ text: value.slice(cursor), type: "text" });
  }

  return tokens;
}
