/**
 * lib install command
 *
 * Install entire ecosystem (clone missing, install deps, build in DAG order).
 */
module.exports = {
    name: "install",
    alias: ["i"],
    description: "Install entire ecosystem (clone, install, build)",
    run: async (toolbox) => {
        const { parameters, dispatch, print } = toolbox;
        const opts = parameters.options;
        const input = {
            rootPath: opts["root"] ?? opts["r"],
            dryRun: opts["dry-run"] ?? opts["d"] ?? false,
            continueOnError: opts["continue"] ?? opts["c"] ?? false,
            concurrency: Number(opts["concurrency"] ?? opts["j"]) || 4,
        };
        try {
            const result = await dispatch.call(["lib", "install"], input);
            if (input.dryRun) {
                print.info("[DRY RUN] Would clone:");
                for (const name of result.cloned) {
                    print.info(`  ${name}`);
                }
                return;
            }
            if (result.cloned.length > 0) {
                print.success(`Cloned ${result.cloned.length} repo(s)`);
            }
            if (result.installed.length > 0) {
                print.success(`Installed ${result.installed.length} package(s)`);
            }
            if (result.failed.length > 0) {
                print.error(`${result.failed.length} package(s) failed:`);
                for (const f of result.failed) {
                    print.error(`  - ${f.name}: ${f.error}`);
                }
                process.exitCode = 1;
            }
            else {
                print.success(`Ecosystem installed in ${(result.totalDuration / 1000).toFixed(1)}s`);
            }
        }
        catch (error) {
            print.error(`Failed to install: ${error instanceof Error ? error.message : String(error)}`);
            process.exitCode = 1;
        }
    },
};
export {};
//# sourceMappingURL=install.js.map