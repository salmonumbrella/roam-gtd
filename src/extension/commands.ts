export interface ExtensionCommand {
  callback: () => void;
  label: string;
}

export interface CommandPaletteApi {
  addCommand: (command: ExtensionCommand) => void;
  removeCommand: (command: Pick<ExtensionCommand, "label">) => void;
}

export const EXTENSION_COMMAND_LABELS = {
  dailyReview: "GTD: Daily Review",
  dashboard: "GTD: Open Dashboard",
  nextActions: "GTD: Next Actions",
  rebuildPlansPriorities: "GTD: Rebuild Plans & Priorities",
  spawnToday: "GTD: Spawn Next Actions in Today",
  spawnTomorrow: "GTD: Spawn Next Actions for Tomorrow",
  weeklyReview: "GTD: Weekly Review",
} as const;

export function buildExtensionCommands(args: {
  onOpenDailyReview: () => void;
  onOpenDashboard: () => void;
  onOpenNextActions: () => void;
  onOpenWeeklyReview: () => void;
  onRebuildPlansPriorities: () => void;
  onSpawnTodayNextActions: () => void;
  onSpawnTomorrowNextActions: () => void;
}): Array<ExtensionCommand> {
  return [
    {
      callback: args.onOpenDashboard,
      label: EXTENSION_COMMAND_LABELS.dashboard,
    },
    {
      callback: args.onOpenWeeklyReview,
      label: EXTENSION_COMMAND_LABELS.weeklyReview,
    },
    {
      callback: args.onOpenDailyReview,
      label: EXTENSION_COMMAND_LABELS.dailyReview,
    },
    {
      callback: args.onOpenNextActions,
      label: EXTENSION_COMMAND_LABELS.nextActions,
    },
    {
      callback: args.onSpawnTodayNextActions,
      label: EXTENSION_COMMAND_LABELS.spawnToday,
    },
    {
      callback: args.onSpawnTomorrowNextActions,
      label: EXTENSION_COMMAND_LABELS.spawnTomorrow,
    },
    {
      callback: args.onRebuildPlansPriorities,
      label: EXTENSION_COMMAND_LABELS.rebuildPlansPriorities,
    },
  ];
}

export function registerExtensionCommands(
  commandPalette: CommandPaletteApi,
  commands: Array<ExtensionCommand>,
): () => void {
  for (const command of commands) {
    commandPalette.addCommand(command);
  }

  return () => {
    for (const command of commands) {
      commandPalette.removeCommand({ label: command.label });
    }
  };
}
