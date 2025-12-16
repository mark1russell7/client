/**
 * lib refresh command
 *
 * Refresh a library (npm install, build, optionally git push).
 */
module.exports = {
    name: "refresh",
    alias: ["r"],
    description: "Refresh a library (install, build, optionally commit/push)",
    run: async (toolbox) => {
        const { parameters, dispatch, print } = toolbox;
        const opts = parameters.options;
        const input = {
            path: parameters.first ?? ".",
            recursive: opts["recursive"] ?? opts["r"] ?? false,
            all: opts["all"] ?? opts["a"] ?? false,
            force: opts["force"] ?? opts["f"] ?? false,
            skipGit: opts["skip-git"] ?? opts["g"] ?? false,
            autoConfirm: opts["yes"] ?? opts["y"] ?? false,
            sessionId: dispatch.sessionId,
        };
        try {
            const result = await dispatch.call(["lib", "refresh"], input);
            if (result.success) {
                print.success(`Refreshed ${result.results.length} package(s) in ${(result.totalDuration / 1000).toFixed(1)}s`);
            }
            else {
                const failed = result.results.filter((r) => !r.success);
                print.error(`Refresh completed with ${failed.length} failure(s):`);
                for (const f of failed) {
                    print.error(`  - ${f.name}: ${f.error}`);
                }
                process.exitCode = 1;
            }
        }
        catch (error) {
            print.error(`Failed to refresh: ${error instanceof Error ? error.message : String(error)}`);
            process.exitCode = 1;
        }
    },
};
export {};
//# sourceMappingURL=refresh.js.map