/**
 * config validate command
 *
 * Validate dependencies.json against schema.
 */
module.exports = {
    name: "validate",
    description: "Validate dependencies.json against schema",
    run: async (toolbox) => {
        const { dispatch, print } = toolbox;
        const input = {};
        try {
            const result = await dispatch.call(["config", "validate"], input);
            if (result.success) {
                print.success(result.message);
            }
            else {
                print.error(result.message);
                if (result.errors && result.errors.length > 0) {
                    print.error("Validation errors:");
                    for (const error of result.errors) {
                        print.error(`  ${error}`);
                    }
                }
                process.exitCode = 1;
            }
        }
        catch (error) {
            print.error(`Failed to validate: ${error instanceof Error ? error.message : String(error)}`);
            process.exitCode = 1;
        }
    },
};
export {};
//# sourceMappingURL=validate.js.map