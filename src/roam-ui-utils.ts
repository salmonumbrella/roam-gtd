import type { RoamAlphaAPI, RoamBlockViewType } from "./types/roam";

type UpdateBlockInput = Parameters<RoamAlphaAPI["updateBlock"]>[0];
type BlockViewUpdateInput = Omit<UpdateBlockInput, "block"> & {
  block: UpdateBlockInput["block"] & { "block-view-type": RoamBlockViewType };
};

export function openInSidebar(uid: string): void {
  window.roamAlphaAPI.ui.rightSidebar.addWindow({
    window: { "block-uid": uid, type: "block" },
  });
}

export function setBlockViewType(uid: string, viewType: RoamBlockViewType): Promise<void> {
  return window.roamAlphaAPI.updateBlock({
    block: { "block-view-type": viewType, uid },
  } as BlockViewUpdateInput);
}
