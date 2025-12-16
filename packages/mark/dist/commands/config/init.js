/**
 * config init command
 *
 * Initialize project with dependencies.json using a preset.
 */
module.exports = {
    name: "init",
    description: "Initialize project with dependencies.json",
    run: async (toolbox) => {
        const { parameters, dispatch, print } = toolbox;
        const opts = parameters.options;
        const input = {
            preset: opts["preset"] ?? opts["p"] ?? "lib",
            force: opts["force"] ?? opts["f"] ?? false,
        };
        try {
            const result = await dispatch.call(["config", "init"], input);
            if (result.success) {
                print.success(result.message);
            }
            else {
                print.error(result.message);
                process.exitCode = 1;
            }
        }
        catch (error) {
            print.error(`Failed to init: ${error instanceof Error ? error.message : String(error)}`);
            process.exitCode = 1;
        }
    },
};
export {};
//# sourceMappingURL=init.js.map