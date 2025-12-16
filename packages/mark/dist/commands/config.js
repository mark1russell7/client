/**
 * config command group
 *
 * Configuration management commands.
 */
module.exports = {
    name: "config",
    description: "Configuration management commands",
    run: async (toolbox) => {
        toolbox.print.info("Configuration management commands:");
        toolbox.print.info("");
        toolbox.print.info("  mark config init       Initialize dependencies.json");
        toolbox.print.info("  mark config add        Add a feature");
        toolbox.print.info("  mark config remove     Remove a feature");
        toolbox.print.info("  mark config generate   Generate config files");
        toolbox.print.info("  mark config validate   Validate dependencies.json");
        toolbox.print.info("");
        toolbox.print.info("Run 'mark config <command> --help' for more info.");
    },
};
export {};
//# sourceMappingURL=config.js.map