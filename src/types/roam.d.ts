export type PullWatchCallback = (
  before: RoamPullEntity | null,
  after: RoamPullEntity | null,
) => void;

export interface RoamPullEntity {
  ":block/string"?: string;
  ":block/uid"?: string;
}

export type RoamChildrenViewType = "document" | "bullet" | "numbered";
export type RoamBlockViewType =
  | "tabs"
  | "outline"
  | "horizontal"
  | "popout"
  | "comment"
  | "side"
  | "vertical";

export interface CommandPaletteAddInput {
  callback: () => void;
  "default-hotkey"?: string;
  "disable-hotkey"?: boolean;
  label: string;
}

export interface CommandPaletteRemoveInput {
  label: string;
}

export interface RightSidebarWindow {
  "block-uid": string;
  type: "block" | "outline";
}

export interface RoamSettingsPanelInput {
  settings: Array<RoamSetting>;
  tabTitle: string;
}

export interface RoamInputAction {
  onChange?: (event: Event) => void;
  placeholder: string;
  type: "input";
}

export interface RoamSelectAction {
  items: Array<string>;
  onChange?: (event: Event) => void;
  type: "select";
}

export interface RoamButtonAction {
  content: string;
  onClick?: (event: Event) => void;
  type: "button";
}

export type RoamSettingAction = RoamButtonAction | RoamInputAction | RoamSelectAction;

export interface RoamSetting {
  action: RoamSettingAction;
  description: string;
  id: string;
  name: string;
}

export interface RoamExtensionAPI {
  settings: {
    get: (key: string) => string | number | boolean | null | undefined;
    getAll?: () => Record<string, string | number | boolean | null | undefined>;
    panel: {
      create: (input: RoamSettingsPanelInput) => void;
    };
    set?: (key: string, value: string | number | boolean) => Promise<void> | void;
  };
}

export interface RoamTodoTriggerChangeEvent {
  newState: string;
  oldState: string;
  uid: string;
}

export interface RoamTodoTriggerAPI {
  onStateChange: (cb: (event: RoamTodoTriggerChangeEvent) => void) => void;
}

export interface RoamWorkbenchAPI {
  refreshAttributeSelect?: () => void;
}

export interface RoamGoogleCalendarEvent {
  end: { date?: string; dateTime?: string };
  start: { date?: string; dateTime?: string };
  summary: string;
}

export interface RoamGoogleCalendarResult {
  event: RoamGoogleCalendarEvent;
}

export interface RoamGoogleExtensionAPI {
  fetchGoogleCalendar: (input: {
    endDatePageTitle: string;
    startDatePageTitle: string;
  }) => Promise<Array<RoamGoogleCalendarResult>>;
}

export interface RoamAlphaAPI {
  createBlock: (input: {
    block: {
      "block-view-type"?: RoamBlockViewType;
      "children-view-type"?: RoamChildrenViewType;
      open?: boolean;
      props?: Record<string, unknown>;
      string: string;
      uid?: string;
    };
    location: { order: number | "first" | "last"; "parent-uid": string };
  }) => Promise<void>;
  createPage: (input: { page: { title: string; uid?: string } }) => Promise<void>;
  data: {
    addPullWatch: (pattern: string, entity: string, callback: PullWatchCallback) => boolean;
    fast?: {
      q: (
        query: string,
        ...inputs: ReadonlyArray<string | number | boolean | string[]>
      ) => ReadonlyArray<ReadonlyArray<string | number>>;
    };
    pull: (pattern: string, id: [":block/uid", string] | string) => RoamPullEntity | null;
    q: (
      query: string,
      ...inputs: ReadonlyArray<string | number | boolean | string[]>
    ) => ReadonlyArray<ReadonlyArray<string | number>>;
    removePullWatch: (pattern: string, entity: string, callback: PullWatchCallback) => boolean;
  };
  deleteBlock: (input: { block: { uid: string } }) => Promise<void>;
  moveBlock: (input: {
    block: { uid: string };
    location: { order: number | "first" | "last"; "parent-uid": string };
  }) => Promise<void>;
  ui: {
    commandPalette: {
      addCommand: (input: CommandPaletteAddInput) => void;
      removeCommand: (input: CommandPaletteRemoveInput) => void;
    };
    components: {
      renderBlock: (input: {
        el: HTMLElement;
        open?: boolean;
        "open?"?: boolean;
        uid: string;
        "zoom-path?"?: boolean;
        "zoom-start-after-uid"?: string;
        zoomPath?: boolean;
        zoomStartAfterUid?: string;
      }) => void;
      renderPage: (input: { el: HTMLElement; uid: string }) => void;
    };
    rightSidebar: {
      addWindow: (input: { window: RightSidebarWindow }) => void;
    };
  };
  updateBlock: (input: {
    block: {
      "block-view-type"?: RoamBlockViewType;
      "children-view-type"?: RoamChildrenViewType;
      open?: boolean;
      props?: Record<string, unknown>;
      string?: string;
      uid: string;
    };
  }) => Promise<void>;
  util: {
    generateUID: () => string;
  };
}

declare global {
  interface Window {
    roamAlphaAPI: RoamAlphaAPI;
    roamjs?: {
      extension?: {
        google?: RoamGoogleExtensionAPI;
        todoTrigger?: RoamTodoTriggerAPI;
        workbench?: RoamWorkbenchAPI;
      };
    };
  }
}
