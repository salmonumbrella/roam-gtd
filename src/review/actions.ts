import {
  parseTaskMarker,
  replaceTaskMarker,
  stripTaskMarker,
  stripTaskStatusMacros,
} from "../task-text";

export function escapeRegex(input: string): string {
  return input.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function normalizeTagName(tag: string): string {
  return tag.trim().replace(/^#/, "").replace(/^\[\[/, "").replace(/\]\]$/, "");
}

export function removeHashTagForms(text: string, tag: string): string {
  const normalizedTag = normalizeTagName(tag);
  if (!normalizedTag) {
    return text;
  }

  const escaped = escapeRegex(normalizedTag);
  const patterns = [
    new RegExp(`#\\[\\[${escaped}\\]\\]`, "gi"),
    new RegExp(`#${escaped}(?=\\s|$)`, "gi"),
  ];

  let cleaned = text;
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, "");
  }

  return cleaned.replaceAll(/\s{2,}/g, " ").trim();
}

export function removeTagForms(text: string, tag: string): string {
  const normalizedTag = normalizeTagName(tag);
  if (!normalizedTag) {
    return text;
  }

  const escaped = escapeRegex(normalizedTag);
  const patterns = [
    new RegExp(`#\\[\\[${escaped}\\]\\]`, "gi"),
    new RegExp(`#${escaped}(?=\\s|$)`, "gi"),
    new RegExp(`\\[\\[${escaped}\\]\\]`, "gi"),
  ];

  let cleaned = text;
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, "");
  }

  return cleaned.replaceAll(/\s{2,}/g, " ").trim();
}

export function removeTagFormsBatch(text: string, tags: Array<string>): string {
  const seen = new Set<string>();
  let cleaned = text;

  for (const tag of tags) {
    const normalizedTag = normalizeTagName(tag).toLowerCase();
    if (!normalizedTag || seen.has(normalizedTag)) {
      continue;
    }
    seen.add(normalizedTag);
    cleaned = removeTagForms(cleaned, tag);
  }

  return cleaned.replaceAll(/\s{2,}/g, " ").trim();
}

export function replaceTagsInText(
  text: string,
  oldTags: Array<string>,
  newTag: string | null,
): string {
  const withoutOldTags = removeTagFormsBatch(text, oldTags);
  const normalizedNewTag = newTag ? normalizeTagName(newTag) : "";
  if (!normalizedNewTag) {
    return withoutOldTags;
  }

  const escapedNewTag = escapeRegex(normalizedNewTag);
  const hasTag = new RegExp(`#\\[\\[${escapedNewTag}\\]\\]|#${escapedNewTag}(?=\\s|$)`, "i").test(
    withoutOldTags,
  );
  return hasTag ? withoutOldTags : `${withoutOldTags} #[[${normalizedNewTag}]]`.trim();
}

export function stripTodoStatusMarkers(text: string): string {
  const withoutMacros = stripTaskStatusMacros(text, { includeArchived: false });
  const marker = parseTaskMarker(withoutMacros);
  if (marker === "todo" || marker === "done") {
    return stripTaskMarker(withoutMacros)
      .replaceAll(/\s{2,}/g, " ")
      .trim();
  }
  return withoutMacros;
}

export function replaceWithArchivedMarker(text: string): string {
  const marker = parseTaskMarker(text);
  return marker === "todo" || marker === "done" ? replaceTaskMarker(text, "archived") : text;
}

export async function archiveBlock(
  blockUid: string,
  workflowTags: Array<string>,
  currentText?: string,
): Promise<void> {
  try {
    const sourceText =
      currentText ??
      window.roamAlphaAPI.data.pull("[:block/string]", [":block/uid", blockUid])?.[":block/string"];

    if (sourceText) {
      const withArchived = replaceWithArchivedMarker(sourceText);
      const withoutTags = removeTagFormsBatch(withArchived, workflowTags);
      if (withoutTags !== sourceText) {
        await window.roamAlphaAPI.updateBlock({
          block: { string: withoutTags, uid: blockUid },
        });
      }
    }

    const childRows = window.roamAlphaAPI.data.q(
      `[:find ?child-uid ?child-string
        :in $ ?parent-uid [?tag-title ...]
        :where
          [?parent :block/uid ?parent-uid]
          [?child :block/parents ?parent]
          [?tag-page :node/title ?tag-title]
          [?child :block/refs ?tag-page]
          [?child :block/uid ?child-uid]
          [?child :block/string ?child-string]]`,
      blockUid,
      workflowTags,
    );

    if (!childRows?.length) {
      return;
    }

    for (const row of childRows) {
      if (!Array.isArray(row) || typeof row[0] !== "string" || typeof row[1] !== "string") {
        continue;
      }
      const [childUid, childText] = row;
      const cleanedChild = removeTagFormsBatch(childText, workflowTags);
      if (cleanedChild !== childText) {
        await window.roamAlphaAPI.updateBlock({
          block: { string: cleanedChild, uid: childUid },
        });
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console -- surface write failures for debugging
    console.warn("[RoamGTD] archiveBlock failed:", blockUid, error);
  }
}

export async function appendTag(blockUid: string, tag: string, blockString: string): Promise<void> {
  const normalized = normalizeTagName(tag);
  if (!normalized) {
    return;
  }
  const escaped = escapeRegex(normalized);
  const alreadyPresent = new RegExp(`#\\[\\[${escaped}\\]\\]|#${escaped}(?=\\s|$)`, "i").test(
    blockString,
  );
  if (alreadyPresent) {
    return;
  }
  await window.roamAlphaAPI.updateBlock({
    block: { string: `${blockString} #[[${normalized}]]`, uid: blockUid },
  });
}

export async function replaceTag(
  blockUid: string,
  oldTag: string,
  newTag: string | null,
  currentText?: string,
): Promise<void> {
  try {
    const sourceText =
      currentText ??
      window.roamAlphaAPI.data.pull("[:block/string]", [":block/uid", blockUid])?.[":block/string"];

    if (!sourceText) {
      return;
    }

    const nextText = replaceTagsInText(sourceText, [oldTag], newTag);
    if (nextText === sourceText) {
      return;
    }

    await window.roamAlphaAPI.updateBlock({
      block: { string: nextText, uid: blockUid },
    });
  } catch (error) {
    // eslint-disable-next-line no-console -- surface write failures for debugging
    console.warn("[RoamGTD] replaceTag failed:", blockUid, error);
  }
}

export async function replaceTags(
  blockUid: string,
  oldTags: Array<string>,
  newTag: string | null,
  currentText?: string,
): Promise<boolean> {
  try {
    const sourceText =
      currentText ??
      window.roamAlphaAPI.data.pull("[:block/string]", [":block/uid", blockUid])?.[":block/string"];

    if (!sourceText) {
      return false;
    }

    const nextText = replaceTagsInText(sourceText, oldTags, newTag);
    if (nextText === sourceText) {
      return false;
    }

    await window.roamAlphaAPI.updateBlock({
      block: { string: nextText, uid: blockUid },
    });
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console -- surface write failures for debugging
    console.warn("[RoamGTD] replaceTag failed:", blockUid, error);
    return false;
  }
}

export async function markDone(blockUid: string, currentText?: string): Promise<boolean> {
  try {
    const sourceText =
      currentText ??
      window.roamAlphaAPI.data.pull("[:block/string]", [":block/uid", blockUid])?.[":block/string"];

    if (!sourceText) {
      return false;
    }

    const nextText =
      parseTaskMarker(sourceText) === "todo" ? replaceTaskMarker(sourceText, "done") : sourceText;
    if (nextText === sourceText) {
      return false;
    }

    await window.roamAlphaAPI.updateBlock({
      block: { string: nextText, uid: blockUid },
    });
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console -- surface write failures for debugging
    console.warn("[RoamGTD] markDone failed:", blockUid, error);
    return false;
  }
}

export async function removeTodoMarker(blockUid: string, currentText?: string): Promise<void> {
  try {
    const sourceText =
      currentText ??
      window.roamAlphaAPI.data.pull("[:block/string]", [":block/uid", blockUid])?.[":block/string"];

    if (!sourceText) {
      return;
    }

    const nextText = stripTodoStatusMarkers(sourceText);
    if (nextText === sourceText) {
      return;
    }

    await window.roamAlphaAPI.updateBlock({
      block: { string: nextText, uid: blockUid },
    });
  } catch (error) {
    // eslint-disable-next-line no-console -- surface write failures for debugging
    console.warn("[RoamGTD] removeTodoMarker failed:", blockUid, error);
  }
}
