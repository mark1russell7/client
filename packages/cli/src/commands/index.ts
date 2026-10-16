export type CommandHandler = (args: string[]) => Promise<void> | void;
export type CommandGroup = Record<string, CommandHandler>;

/**
 * This map holds the command groups of the repository tool. The map is empty: `lib new` makes the
 * packages, and `lib.rename` renames them.
 */
export const commands: Record<string, CommandGroup> = {};
