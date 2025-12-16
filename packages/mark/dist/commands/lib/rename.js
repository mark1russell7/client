/**
 * lib rename command
 *
 * Rename a package across the codebase.
 */
module.exports = {
    name: "rename",
    description: "Rename a package across the codebase",
    run: async (toolbox) => {
        const { parameters, dispatch, print } = toolbox;
        const opts = parameters.options;
        const oldName = parameters.first;
        const newName = parameters.second;
        if (!oldName || !newName) {
            print.error("Usage: mark lib rename <old-name> <new-name>");
            process.exitCode = 1;
            return;
        }
        const input = {
            oldName,
            newName,
            rootPath: opts["root"] ?? opts["r"],
            dryRun: opts["dry-run"] ?? opts["d"] ?? false,
        };
        try {
            const result = await dispatch.call(["lib", "rename"], input);
            if (input.dryRun) {
                print.info(`[DRY RUN] Would make ${result.changes.length} change(s):`);
            }
            else {
                print.success(`Made ${result.changes.length} change(s):`);
            }
            for (const change of result.changes) {
                print.info(`  ${change.type}: ${change.file}`);
            }
        }
        catch (error) {
            print.error(`Failed to rename: ${error instanceof Error ? error.message : String(error)}`);
            process.exitCode = 1;
        }
    },
};
export {};
//# sourceMappingURL=rename.js.map