/**
 * config generate command
 *
 * Generate package.json, tsconfig.json, .gitignore from dependencies.json.
 */
module.exports = {
    name: "generate",
    alias: ["gen"],
    description: "Generate config files from dependencies.json",
    run: async (toolbox) => {
        const { dispatch, print } = toolbox;
        const input = {};
        try {
            const result = await dispatch.call(["config", "generate"], input);
            if (result.success) {
                print.success(result.message);
                if (result.generated.length > 0) {
                    print.info("Generated files:");
                    for (const file of result.generated) {
                        print.info(`  ${file}`);
                    }
                }
            }
            else {
                print.error(result.message);
                process.exitCode = 1;
            }
        }
        catch (error) {
            print.error(`Failed to generate: ${error instanceof Error ? error.message : String(error)}`);
            process.exitCode = 1;
        }
    },
};
export {};
//# sourceMappingURL=generate.js.map