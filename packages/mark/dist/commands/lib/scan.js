/**
 * lib scan command
 *
 * Scan for packages and show package-to-repo mapping.
 */
module.exports = {
    name: "scan",
    alias: ["s"],
    description: "Scan for packages and show package-to-repo mapping",
    run: async (toolbox) => {
        const { parameters, dispatch, print } = toolbox;
        const input = {
            rootPath: parameters.first,
        };
        try {
            const result = await dispatch.call(["lib", "scan"], input);
            const packages = Object.values(result.packages);
            print.info(`Found ${packages.length} package(s):\n`);
            for (const pkg of packages) {
                print.info(`  ${pkg.name}`);
                print.muted(`    ${pkg.repoPath}`);
                if (pkg.mark1russell7Deps.length > 0) {
                    print.muted(`    deps: ${pkg.mark1russell7Deps.join(", ")}`);
                }
            }
        }
        catch (error) {
            print.error(`Failed to scan: ${error instanceof Error ? error.message : String(error)}`);
            process.exitCode = 1;
        }
    },
};
export {};
//# sourceMappingURL=scan.js.map