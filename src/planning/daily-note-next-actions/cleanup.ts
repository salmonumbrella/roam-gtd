import deleteBlock from "roamjs-components/writes/deleteBlock";

import type { GtdSettings } from "../../settings";
import { hasWorkflowTag } from "../../tag-utils";
import { matchOptionalTaskBlockRef } from "../../task-text";
import { isDueOrReminderAttributeString } from "./scheduled";

const BLOCK_REF_REGEX = /^\(\(([A-Za-z0-9_-]+)\)\)$/u;

interface CleanupChild {
  order: number;
  string: string;
  uid: string;
}

interface CleanupDeps {
  getBlockStringByUid(uid: string): string | null;
  getOrderedChildren(parentUid: string): Array<CleanupChild>;
}

export function isGeneratedContextHeading(text: string): boolean {
  const trimmed = text.trim();
  return trimmed === "No context" || trimmed.startsWith("#");
}

function isBlockRefLine(text: string): boolean {
  return BLOCK_REF_REGEX.test(text.trim());
}

function getReferencedUid(text: string): string | null {
  const match = text.trim().match(BLOCK_REF_REGEX);
  return match?.[1] ?? null;
}

function getReferencedUidFromPlanLine(text: string): string | null {
  return matchOptionalTaskBlockRef(text)?.uid ?? null;
}

function isProjectHeading(blockString: string): boolean {
  const trimmed = blockString.trim();
  return /^(?:\*\*|__)?\s*Project\s*::/iu.test(trimmed);
}

export function hasOnlyBlockRefChildren(
  parentUid: string,
  deps: Pick<CleanupDeps, "getOrderedChildren">,
): boolean {
  const children = deps.getOrderedChildren(parentUid);
  return children.length > 0 && children.every((child) => isBlockRefLine(child.string));
}

export function hasOnlyNextActionRefChildren(
  parentUid: string,
  settings: GtdSettings,
  deps: CleanupDeps,
): boolean {
  const children = deps.getOrderedChildren(parentUid);
  if (children.length === 0) {
    return false;
  }
  return children.every((child) => {
    const referencedUid = getReferencedUid(child.string);
    if (!referencedUid) {
      return false;
    }
    const targetString = deps.getBlockStringByUid(referencedUid);
    return typeof targetString === "string" && hasWorkflowTag(targetString, settings.tagNextAction);
  });
}

export function hasOnlyScheduledRefChildren(parentUid: string, deps: CleanupDeps): boolean {
  const children = deps.getOrderedChildren(parentUid);
  if (children.length === 0) {
    return false;
  }
  return children.every((child) => {
    const referencedUid = getReferencedUid(child.string);
    if (!referencedUid) {
      return false;
    }
    const targetString = deps.getBlockStringByUid(referencedUid);
    return typeof targetString === "string" && isDueOrReminderAttributeString(targetString);
  });
}

async function clearGeneratedDirectScheduledRefs(
  parentUid: string,
  deps: CleanupDeps,
): Promise<void> {
  const children = deps.getOrderedChildren(parentUid).sort((a, b) => b.order - a.order);
  for (const child of children) {
    const referencedUid = getReferencedUidFromPlanLine(child.string);
    if (!referencedUid) {
      continue;
    }
    if (!hasOnlyScheduledRefChildren(child.uid, deps)) {
      continue;
    }
    await deleteBlock(child.uid);
  }
}

async function clearGeneratedDirectNextActionRefs(
  parentUid: string,
  settings: GtdSettings,
  deps: CleanupDeps,
): Promise<void> {
  const children = deps.getOrderedChildren(parentUid).sort((a, b) => b.order - a.order);
  for (const child of children) {
    const referencedUid = getReferencedUid(child.string);
    if (!referencedUid) {
      continue;
    }
    const targetString = deps.getBlockStringByUid(referencedUid);
    if (!targetString) {
      continue;
    }
    if (!hasWorkflowTag(targetString, settings.tagNextAction)) {
      continue;
    }
    await deleteBlock(child.uid);
  }
}

async function clearGeneratedDirectProjectRefs(
  parentUid: string,
  settings: GtdSettings,
  deps: CleanupDeps,
): Promise<void> {
  const children = deps.getOrderedChildren(parentUid).sort((a, b) => b.order - a.order);
  for (const child of children) {
    const referencedUid = getReferencedUid(child.string);
    if (!referencedUid) {
      continue;
    }
    const targetString = deps.getBlockStringByUid(referencedUid);
    if (!targetString || !isProjectHeading(targetString)) {
      continue;
    }
    if (!hasOnlyNextActionRefChildren(child.uid, settings, deps)) {
      continue;
    }
    await deleteBlock(child.uid);
  }
}

async function clearGeneratedContextGroups(
  parentUid: string,
  deps: Pick<CleanupDeps, "getOrderedChildren">,
): Promise<void> {
  const children = deps.getOrderedChildren(parentUid).sort((a, b) => b.order - a.order);
  for (const child of children) {
    if (!isGeneratedContextHeading(child.string)) {
      continue;
    }
    if (!hasOnlyBlockRefChildren(child.uid, deps)) {
      continue;
    }
    await deleteBlock(child.uid);
  }
}

export async function clearLegacyGeneratedSubtrees(
  parentUid: string,
  sectionBlockText: string,
  generatedRootText: string,
  deps: Pick<CleanupDeps, "getOrderedChildren">,
): Promise<void> {
  const children = deps.getOrderedChildren(parentUid).sort((a, b) => b.order - a.order);
  for (const child of children) {
    const trimmed = child.string.trim();
    if (trimmed === generatedRootText) {
      await deleteBlock(child.uid);
      continue;
    }

    if (trimmed !== sectionBlockText) {
      continue;
    }

    const sectionChildren = deps
      .getOrderedChildren(child.uid)
      .filter((sectionChild) => sectionChild.string.trim() === generatedRootText)
      .sort((a, b) => b.order - a.order);
    if (sectionChildren.length === 0) {
      continue;
    }

    for (const sectionChild of sectionChildren) {
      await deleteBlock(sectionChild.uid);
    }

    if (deps.getOrderedChildren(child.uid).length === 0) {
      await deleteBlock(child.uid);
    }
  }
}

export async function clearGeneratedNextActionArtifacts(
  parentUid: string,
  settings: GtdSettings,
  options: {
    generatedRootText: string;
    sectionBlockText: string;
  },
  deps: CleanupDeps,
): Promise<void> {
  await clearLegacyGeneratedSubtrees(
    parentUid,
    options.sectionBlockText,
    options.generatedRootText,
    deps,
  );
  await clearGeneratedContextGroups(parentUid, deps);
  await clearGeneratedDirectNextActionRefs(parentUid, settings, deps);
  await clearGeneratedDirectProjectRefs(parentUid, settings, deps);
  await clearGeneratedDirectScheduledRefs(parentUid, deps);
}
