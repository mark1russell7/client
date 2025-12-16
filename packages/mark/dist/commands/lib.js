/**
 * lib command group
 *
 * Library management commands.
 */
module.exports = {
    name: "lib",
    description: "Library management commands",
    run: async (toolbox) => {
        toolbox.print.info("Library management commands:");
        toolbox.print.info("");
        toolbox.print.info("  mark lib refresh [path]  Refresh a library");
        toolbox.print.info("  mark lib scan [path]     Scan for packages");
        toolbox.print.info("  mark lib rename          Rename a package");
        toolbox.print.info("  mark lib install         Install ecosystem");
        toolbox.print.info("");
        toolbox.print.info("Run 'mark lib <command> --help' for more info.");
    },
};
export {};
//# sourceMappingURL=lib.js.map