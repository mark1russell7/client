#!/usr/bin/env node
/**
 * Mark CLI - Gluegun-based CLI
 *
 * A thin wrapper that dispatches to client procedures.
 */
import { build } from "gluegun";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/**
 * Build and run the CLI
 */
async function run(argv) {
    const cli = build()
        .brand("mark")
        .src(__dirname)
        .plugins("./node_modules", { matching: "mark-*", hidden: true })
        .help()
        .version()
        .create();
    await cli.run(argv);
}
// Run with process.argv
run(process.argv.slice(2));
export { run };
//# sourceMappingURL=cli.js.map