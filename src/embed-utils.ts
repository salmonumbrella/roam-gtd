export function normalizeTagReference(value: string): string {
  return value
    .replaceAll("\u00a0", " ")
    .trim()
    .replace(/^#/, "")
    .replace(/^\[\[/, "")
    .replace(/\]\]$/, "")
    .trim()
    .toLowerCase();
}

export function hideTagReferenceInEmbed(container: HTMLElement, tagTitle: string): void {
  const normalizedTag = normalizeTagReference(tagTitle);
  if (!normalizedTag) {
    return;
  }

  const nodes = container.querySelectorAll<HTMLElement>("span, a");
  for (const node of nodes) {
    const className = typeof node.className === "string" ? node.className : "";
    if (!className.includes("rm-page-ref")) {
      continue;
    }
    const previousTextNode =
      node.previousSibling?.nodeType === Node.TEXT_NODE ? (node.previousSibling as Text) : null;
    const hasTagRefClass =
      className.includes("rm-page-ref--tag") ||
      className.includes("rm-page-ref-tag") ||
      className.includes("rm-page-ref__tag");
    const hasHashPrefix = (previousTextNode?.textContent ?? "").includes("#");
    if (!hasTagRefClass && !hasHashPrefix) {
      continue;
    }
    const nodeLabel = normalizeTagReference(node.textContent ?? "");
    if (nodeLabel !== normalizedTag) {
      continue;
    }
    node.style.display = "none";
    if (previousTextNode) {
      previousTextNode.textContent = (previousTextNode.textContent ?? "").replace(/#\s*$/, "");
    }
  }
}
