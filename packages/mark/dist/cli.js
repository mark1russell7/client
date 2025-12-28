#!/usr/bin/env node
"use strict";
/**
 * Mark CLI
 *
 * A generic CLI that reflects registered procedures.
 * Uses our own routing with Gluegun's toolbox for utilities.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const gluegun_1 = require("gluegun");
const parse_1 = require("./parse");
const format_1 = require("./format");
const ecosystem_1 = require("./ecosystem");
const server_mode_1 = require("./server-mode");
const client_mode_1 = require("./client-mode");
const VERSION = "1.0.0";
/**
 * Convert procedure path to transport method
 */
function pathToMethod(path) {
    const [service, ...rest] = path;
    return { service: service, operation: rest.join(".") };
}
/**
 * Register procedure handlers on the transport
 */
function syncRegistryToTransport(transport, registry) {
    // Helper to execute a procedure by path (for ctx.client.call)
    async function execProcedure(path, input) {
        const proc = registry.get(path);
        if (!proc || !proc.handler) {
            throw new Error(`Procedure not found: ${path.join(".")}`);
        }
        const ctx = createContext(path);
        return proc.handler(input, ctx);
    }
    // Helper to create ProcedureContext with client.call support
    function createContext(path) {
        return {
            metadata: {},
            path,
            client: {
                call: (p, i) => execProcedure(p, i),
            },
        };
    }
    for (const procedure of registry.getAll()) {
        if (procedure.handler) {
            const method = pathToMethod(procedure.path);
            transport.register(method, async (payload, message) => {
                const context = {
                    ...createContext(procedure.path),
                    metadata: message.metadata ?? {},
                    ...(message.signal ? { signal: message.signal } : {}),
                };
                return procedure.handler(payload, context);
            });
        }
    }
    registry.on("register", (procedure) => {
        if (procedure.handler) {
            const method = pathToMethod(procedure.path);
            transport.register(method, async (payload, message) => {
                const context = {
                    ...createContext(procedure.path),
                    metadata: message.metadata ?? {},
                    ...(message.signal ? { signal: message.signal } : {}),
                };
                return procedure.handler(payload, context);
            });
        }
    });
}
/**
 * Parse command line arguments with procedure-aware path detection
 */
function parseArgs(argv, procedures) {
    const path = [];
    const args = [];
    const options = {};
    let i = 0;
    // Collect path segments, stopping when we find a matching procedure
    while (i < argv.length) {
        const current = argv[i];
        if (current === undefined || current.startsWith("-"))
            break;
        // Check if adding this segment would still match a procedure or be a prefix
        const testPath = [...path, current];
        const exactMatch = findProcedure(procedures, testPath);
        const hasChildren = findChildren(procedures, testPath).length > 0;
        if (exactMatch) {
            // Found a procedure - add this segment and stop collecting path
            path.push(current);
            i++;
            break;
        }
        else if (hasChildren) {
            // This is a valid prefix (e.g., "procedure" has children like "procedure.get")
            path.push(current);
            i++;
        }
        else if (path.length === 0) {
            // First segment must be part of a valid path
            path.push(current);
            i++;
        }
        else {
            // No match and no children - this must be a positional arg
            break;
        }
    }
    // Remaining non-option args are positional arguments
    while (i < argv.length) {
        const arg = argv[i];
        if (arg === undefined) {
            i++;
            continue;
        }
        if (arg.startsWith("--")) {
            const eqIndex = arg.indexOf("=");
            if (eqIndex !== -1) {
                const key = arg.slice(2, eqIndex);
                const value = arg.slice(eqIndex + 1);
                options[key] = value;
            }
            else {
                const key = arg.slice(2);
                const next = argv[i + 1];
                if (next !== undefined && !next.startsWith("-")) {
                    if (next !== "true" && next !== "false" && !/^\d+$/.test(next)) {
                        options[key] = next;
                        i++;
                    }
                    else {
                        options[key] = true;
                    }
                }
                else {
                    options[key] = true;
                }
            }
        }
        else if (arg.startsWith("-") && arg.length === 2) {
            const key = arg.slice(1);
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith("-")) {
                options[key] = next;
                i++;
            }
            else {
                options[key] = true;
            }
        }
        else {
            args.push(arg);
        }
        i++;
    }
    return { path, args, options };
}
/**
 * Find a procedure matching the given path
 */
function findProcedure(procedures, path) {
    return procedures.find((p) => {
        if (p.path.length !== path.length)
            return false;
        return p.path.every((seg, i) => seg === path[i]);
    });
}
/**
 * Find procedures that are children of the given path
 */
function findChildren(procedures, path) {
    return procedures.filter((p) => {
        if (p.path.length <= path.length)
            return false;
        return path.every((seg, i) => seg === p.path[i]);
    });
}
/**
 * Show help for a path (either a command or a group)
 */
function showHelp(procedures, path) {
    const proc = findProcedure(procedures, path);
    if (proc) {
        // Show help for specific command with schema introspection
        const meta = (proc.metadata ?? {});
        gluegun_1.print.info((0, parse_1.generateHelp)(path, meta, proc.input));
        return;
    }
    // Show help for group
    const children = findChildren(procedures, path);
    if (children.length > 0) {
        const groupName = path.join(" ");
        gluegun_1.print.info(`${groupName} commands:\n`);
        // Direct children only
        const directChildren = children.filter((p) => p.path.length === path.length + 1);
        for (const child of directChildren) {
            const meta = (child.metadata ?? {});
            const cmdName = child.path[child.path.length - 1] ?? "";
            const desc = meta.description ?? "";
            gluegun_1.print.info(`  mark ${groupName} ${cmdName}  ${desc}`);
        }
        // Child groups
        const childGroups = new Set();
        for (const child of children) {
            if (child.path.length > path.length + 1) {
                const groupSeg = child.path[path.length];
                if (groupSeg)
                    childGroups.add(groupSeg);
            }
        }
        for (const group of childGroups) {
            gluegun_1.print.info(`  mark ${groupName} ${group}  ${group} commands`);
        }
        gluegun_1.print.info(`\nRun 'mark ${groupName} <command> --help' for more info.`);
        return;
    }
    // Unknown command
    gluegun_1.print.error(`Unknown command: mark ${path.join(" ")}`);
    gluegun_1.print.info("Run 'mark --help' for available commands.");
}
/**
 * Show root help
 */
function showRootHelp(procedures) {
    gluegun_1.print.info(`mark v${VERSION} - Development workflow automation\n`);
    gluegun_1.print.info("Commands:\n");
    // Group by first path segment
    const groups = new Map();
    for (const proc of procedures) {
        const group = proc.path[0] ?? "other";
        if (!groups.has(group)) {
            groups.set(group, []);
        }
        groups.get(group).push(proc);
    }
    for (const [group, procs] of groups) {
        gluegun_1.print.info(`  ${group}`);
        for (const proc of procs) {
            const meta = (proc.metadata ?? {});
            const cmdPath = proc.path.join(" ");
            const desc = meta.description ?? "";
            gluegun_1.print.info(`    mark ${cmdPath}  ${desc}`);
        }
        gluegun_1.print.info("");
    }
    gluegun_1.print.info("Run 'mark <command> --help' for more information.");
}
/**
 * Run the CLI
 */
async function run(argv) {
    // Handle --version early (no imports needed)
    if (argv.includes("--version") || argv.includes("-v")) {
        gluegun_1.print.info(`mark v${VERSION}`);
        return;
    }
    const verbose = argv.includes("--verbose") || argv.includes("-V");
    // Handle --server flag: start server mode
    if (argv.includes("--server")) {
        const port = (0, server_mode_1.extractPort)(argv) ?? 3000;
        const host = (0, server_mode_1.extractHost)(argv) ?? "0.0.0.0";
        await (0, server_mode_1.startServerMode)({ port, host, verbose });
        return; // Server mode keeps running
    }
    // Dynamic imports for ESM packages (CLI is CommonJS for Gluegun compatibility)
    const clientModule = await import("@mark1russell7/client");
    const { Client, LocalTransport, PROCEDURE_REGISTRY } = clientModule;
    // Dynamic ecosystem discovery - load procedures from all ecosystem packages
    // This includes client-cli, client-logger, and all other procedure packages
    await (0, ecosystem_1.loadEcosystemProcedures)(verbose);
    // Create client with local transport
    const transport = new LocalTransport();
    syncRegistryToTransport(transport, PROCEDURE_REGISTRY);
    const client = new Client({ transport });
    // Get all registered procedures
    const procedures = PROCEDURE_REGISTRY.getAll();
    // Parse arguments (needs procedures for path detection)
    const { path, args, options } = parseArgs(argv, procedures);
    // Try client mode: connect to running server if available (unless --local)
    if (!argv.includes("--local") && path.length > 0 && !options["help"] && !options["h"]) {
        const clientResult = await (0, client_mode_1.tryClientMode)(path, args, options, procedures);
        if (clientResult !== null) {
            if (clientResult.success) {
                // Determine output format
                const meta = (findProcedure(procedures, path)?.metadata ?? {});
                const formatOverride = options["format"];
                const outputFormat = (formatOverride ?? meta.output ?? "text");
                (0, format_1.formatOutput)(gluegun_1.print, clientResult.result, outputFormat);
                return;
            }
            // If clientResult returned but not success, still fall through to local
        }
        // clientResult is null means no server, fall through to local execution
    }
    // Handle --json flag for raw procedure reference execution
    const jsonInput = options["json"];
    if (jsonInput && typeof jsonInput === "string") {
        try {
            // Parse JSON and check for $proc
            const parsed = JSON.parse(jsonInput);
            if (parsed && typeof parsed === "object" && "$proc" in parsed) {
                // Execute as procedure reference via client.exec()
                const result = await client.exec(parsed);
                (0, format_1.formatOutput)(gluegun_1.print, result, "json");
                return;
            }
        }
        catch (e) {
            gluegun_1.print.error(`Failed to parse --json input: ${e instanceof Error ? e.message : String(e)}`);
            process.exitCode = 1;
            return;
        }
    }
    // Handle root help
    if (path.length === 0) {
        showRootHelp(procedures);
        return;
    }
    // Handle help for specific path
    if (options["help"] || options["h"]) {
        showHelp(procedures, path);
        return;
    }
    // Find matching procedure
    const proc = findProcedure(procedures, path);
    if (!proc) {
        // Maybe it's a group?
        const children = findChildren(procedures, path);
        if (children.length > 0) {
            showHelp(procedures, path);
        }
        else {
            gluegun_1.print.error(`Unknown command: mark ${path.join(" ")}`);
            gluegun_1.print.info("Run 'mark --help' for available commands.");
        }
        return;
    }
    // Execute the procedure
    const meta = (proc.metadata ?? {});
    // Extract --format flag before parsing (it's a CLI-level option, not procedure input)
    const formatOverride = options["format"];
    const validFormats = ["text", "json", "table", "streaming"];
    if (formatOverride && !validFormats.includes(formatOverride)) {
        gluegun_1.print.error(`Invalid format: ${formatOverride}. Valid formats: ${validFormats.join(", ")}`);
        process.exitCode = 1;
        return;
    }
    // Remove format from options so it doesn't get passed to procedure
    delete options["format"];
    delete options["f"];
    // Build parameters for parsing
    const parameters = {
        array: args,
        options,
    };
    try {
        // Parse input from CLI args
        const input = (0, parse_1.parseFromSchema)(parameters, meta);
        // Use --format override if provided, otherwise use procedure's default
        const outputFormat = (formatOverride ?? meta.output ?? "text");
        let spinner;
        if (outputFormat === "streaming") {
            spinner = gluegun_1.print.spin(`Running ${path.join(" ")}...`);
        }
        // Validate and call
        let validated = input;
        if (proc.input) {
            validated = proc.input.parse(input);
        }
        const method = pathToMethod(path);
        const result = await client.call(method, validated);
        // Stop spinner and format output
        if (spinner) {
            spinner.succeed(`${path.join(" ")} complete`);
        }
        (0, format_1.formatOutput)(gluegun_1.print, result, outputFormat);
    }
    catch (error) {
        gluegun_1.print.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    }
}
// Entry point
run(process.argv.slice(2));
//# sourceMappingURL=cli.js.map