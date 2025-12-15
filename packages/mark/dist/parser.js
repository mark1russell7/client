/**
 * Commander Parser Builder
 *
 * Builds a Commander program from the declarative CLI spec.
 */
import { Command } from "commander";
import { dispatch, formatResult } from "./dispatch.js";
import { generateSessionId } from "./session.js";
/**
 * Build a Commander program from a CLI spec
 */
export function buildCLI(spec) {
    const program = new Command()
        .name(spec.name)
        .version(spec.version)
        .description(spec.description);
    // Build command tree from specs
    for (const cmdSpec of spec.commands) {
        addCommand(program, cmdSpec);
    }
    return program;
}
/**
 * Add a command to the program based on its spec
 */
function addCommand(parent, spec) {
    // Navigate/create the command hierarchy
    let cmd = parent;
    for (let i = 0; i < spec.path.length - 1; i++) {
        const segment = spec.path[i];
        let subCmd = cmd.commands.find((c) => c.name() === segment);
        if (!subCmd) {
            subCmd = cmd.command(segment).description(`${segment} commands`);
        }
        cmd = subCmd;
    }
    // Add the leaf command
    const leafName = spec.path[spec.path.length - 1];
    const leafCmd = cmd.command(leafName).description(spec.description);
    // Add positional arguments
    const sortedArgs = [...(spec.args ?? [])].sort((a, b) => a.position - b.position);
    for (const arg of sortedArgs) {
        const argStr = arg.required ? `<${arg.name}>` : `[${arg.name}]`;
        leafCmd.argument(argStr, arg.description);
    }
    // Add options
    for (const opt of spec.options ?? []) {
        const flags = opt.short ? `-${opt.short}, --${opt.name}` : `--${opt.name}`;
        if (opt.type === "boolean") {
            leafCmd.option(flags, opt.description);
        }
        else {
            leafCmd.option(`${flags} <value>`, opt.description, String(opt.default));
        }
    }
    // Add action handler
    leafCmd.action(async (...actionArgs) => {
        const sessionId = generateSessionId();
        // Parse positional args
        const args = {};
        for (let i = 0; i < sortedArgs.length; i++) {
            const argSpec = sortedArgs[i];
            const value = actionArgs[i];
            args[argSpec.name] = value !== undefined ? value : argSpec.default;
        }
        // Options are in the last argument (Commander passes them as the last arg)
        const optionsIndex = sortedArgs.length;
        const rawOptions = actionArgs[optionsIndex];
        // Build options with defaults
        const options = {};
        for (const opt of spec.options ?? []) {
            const value = rawOptions?.[opt.name];
            options[opt.name] = value !== undefined ? value : opt.default;
        }
        // Add session ID to options for logging
        options["sessionId"] = sessionId;
        const parsed = { args, options };
        try {
            console.log(`[${sessionId}] Running ${spec.path.join(" ")}...`);
            const result = await dispatch(spec, parsed);
            console.log(formatResult(result));
        }
        catch (error) {
            console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        }
    });
}
//# sourceMappingURL=parser.js.map