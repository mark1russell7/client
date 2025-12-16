/**
 * config remove command
 *
 * Remove a feature from dependencies.json.
 */
module.exports = {
    name: "remove",
    alias: ["rm"],
    description: "Remove a feature from dependencies.json",
    run: async (toolbox) => {
        const { parameters, dispatch, print } = toolbox;
        const feature = parameters.first;
        if (!feature) {
            print.error("Usage: mark config remove <feature>");
            process.exitCode = 1;
            return;
        }
        const input = {
            feature,
        };
        try {
            const result = await dispatch.call(["config", "remove"], input);
            if (result.success) {
                print.success(result.message);
            }
            else {
                print.error(result.message);
                process.exitCode = 1;
            }
        }
        catch (error) {
            print.error(`Failed to remove feature: ${error instanceof Error ? error.message : String(error)}`);
            process.exitCode = 1;
        }
    },
};
export {};
//# sourceMappingURL=remove.js.map