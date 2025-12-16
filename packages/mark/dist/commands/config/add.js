/**
 * config add command
 *
 * Add a feature to dependencies.json.
 */
module.exports = {
    name: "add",
    description: "Add a feature to dependencies.json",
    run: async (toolbox) => {
        const { parameters, dispatch, print } = toolbox;
        const feature = parameters.first;
        if (!feature) {
            print.error("Usage: mark config add <feature>");
            print.info("\nAvailable features: typescript, zod, vitest, eslint, prettier, react, next");
            process.exitCode = 1;
            return;
        }
        const input = {
            feature,
        };
        try {
            const result = await dispatch.call(["config", "add"], input);
            if (result.success) {
                print.success(result.message);
            }
            else {
                print.error(result.message);
                process.exitCode = 1;
            }
        }
        catch (error) {
            print.error(`Failed to add feature: ${error instanceof Error ? error.message : String(error)}`);
            process.exitCode = 1;
        }
    },
};
export {};
//# sourceMappingURL=add.js.map