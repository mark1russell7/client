/**
 * Interactive REPL Mode
 *
 * Starts an interactive session with fast command execution via HTTP.
 * By default, starts its own server on a random port.
 * Use --connect to connect to an existing server.
 */
import * as readline from "node:readline";
import { spawn } from "node:child_process";
import * as path from "node:path";
import { print } from "./print.js";
import { readLockfile, isServerAlive } from "./lockfile.js";
import { loadEcosystemProcedures } from "./ecosystem.js";
import { parseFromSchema } from "./parse.js";
import { formatOutput } from "./format.js";
/**
 * Find an available port
 */
async function findAvailablePort() {
    const net = await import("node:net");
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, () => {
            const addr = server.address();
            if (addr && typeof addr === "object") {
                const port = addr.port;
                server.close(() => resolve(port));
            }
            else {
                reject(new Error("Failed to get port"));
            }
        });
        server.on("error", reject);
    });
}
/**
 * Start a server process on the given port
 */
async function startServerProcess(port, verbose) {
    const cliPath = path.resolve(process.argv[1] ?? "");
    const args = ["--server", "--port", String(port)];
    if (verbose) {
        print.info(`Starting server on port ${port}...`);
    }
    const child = spawn(process.execPath, [cliPath, ...args], {
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
    });
    // Wait for server to be ready (ecosystem loading takes ~8s)
    const spinner = print.spin("Starting server...");
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            spinner.fail("Server startup timeout");
            reject(new Error("Server startup timeout"));
        }, 30000);
        const checkReady = async () => {
            try {
                const response = await fetch(`http://localhost:${port}/api/health`);
                if (response.ok) {
                    clearTimeout(timeout);
                    spinner.succeed(`Server ready on port ${port}`);
                    resolve();
                    return;
                }
            }
            catch {
                // Not ready yet
            }
            setTimeout(checkReady, 500);
        };
        child.on("error", (err) => {
            clearTimeout(timeout);
            spinner.fail(`Server error: ${err.message}`);
            reject(err);
        });
        child.on("exit", (code) => {
            if (code !== 0 && code !== null) {
                clearTimeout(timeout);
                spinner.fail(`Server exited with code ${code}`);
                reject(new Error(`Server exited with code ${code}`));
            }
        });
        setTimeout(checkReady, 500);
    });
    return child;
}
/**
 * Execute a command via HTTP
 */
async function executeCommand(endpoint, path, input) {
    const url = `${endpoint}/${path.join("/")}`;
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    const result = await response.json();
    if (!response.ok && result["error"]) {
        throw new Error(String(result["error"]));
    }
    return result;
}
/**
 * Parse REPL input into command path and arguments
 */
function parseReplInput(input, procedures) {
    const tokens = input.trim().split(/\s+/);
    if (tokens.length === 0 || tokens[0] === "") {
        return null;
    }
    const path = [];
    const args = [];
    const options = {};
    let i = 0;
    // Collect path segments
    while (i < tokens.length) {
        const token = tokens[i];
        if (!token || token.startsWith("-"))
            break;
        const testPath = [...path, token];
        const exactMatch = procedures.find((p) => p.path.length === testPath.length && p.path.every((seg, j) => seg === testPath[j]));
        const hasChildren = procedures.some((p) => p.path.length > testPath.length && testPath.every((seg, j) => seg === p.path[j]));
        if (exactMatch) {
            path.push(token);
            i++;
            break;
        }
        else if (hasChildren || path.length === 0) {
            path.push(token);
            i++;
        }
        else {
            break;
        }
    }
    // Parse remaining as args and options
    while (i < tokens.length) {
        const token = tokens[i];
        if (!token) {
            i++;
            continue;
        }
        if (token.startsWith("--")) {
            const eqIndex = token.indexOf("=");
            if (eqIndex !== -1) {
                const key = token.slice(2, eqIndex);
                const value = token.slice(eqIndex + 1);
                options[key] = value;
            }
            else {
                const key = token.slice(2);
                const next = tokens[i + 1];
                if (next && !next.startsWith("-")) {
                    options[key] = next;
                    i++;
                }
                else {
                    options[key] = true;
                }
            }
        }
        else if (token.startsWith("-") && token.length === 2) {
            const key = token.slice(1);
            const next = tokens[i + 1];
            if (next && !next.startsWith("-")) {
                options[key] = next;
                i++;
            }
            else {
                options[key] = true;
            }
        }
        else {
            args.push(token);
        }
        i++;
    }
    return { path, args, options };
}
/**
 * Start the interactive REPL
 */
export async function startRepl(options) {
    const { connect = false, port: specifiedPort, verbose = false } = options;
    let serverInfo;
    let serverProcess;
    // Load procedures for parsing and help
    await loadEcosystemProcedures(verbose);
    const clientModule = await import("@mark1russell7/client");
    const { PROCEDURE_REGISTRY } = clientModule;
    const procedures = PROCEDURE_REGISTRY.getAll();
    if (connect) {
        // Connect to existing server
        if (specifiedPort) {
            serverInfo = {
                endpoint: `http://localhost:${specifiedPort}/api`,
                ownedByUs: false,
            };
        }
        else {
            const lockfile = await readLockfile();
            if (!lockfile || !(await isServerAlive(lockfile))) {
                print.error("No server running. Start one with 'mark server start' or omit --connect.");
                process.exitCode = 1;
                return;
            }
            serverInfo = {
                endpoint: lockfile.endpoint,
                pid: lockfile.pid,
                ownedByUs: false,
            };
        }
        print.success(`Connected to server at ${serverInfo.endpoint}`);
    }
    else {
        // Start our own server
        const port = specifiedPort ?? (await findAvailablePort());
        serverProcess = await startServerProcess(port, verbose);
        serverInfo = {
            endpoint: `http://localhost:${port}/api`,
            ...(serverProcess.pid !== undefined ? { pid: serverProcess.pid } : {}),
            ownedByUs: true,
        };
        print.success(`Server started on port ${port}`);
    }
    print.info("Type commands or .help for help. Use .exit to quit.\n");
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "mark> ",
    });
    rl.prompt();
    rl.on("line", async (line) => {
        const input = line.trim();
        // Handle REPL commands
        if (input === ".exit" || input === ".quit" || input === ".q") {
            rl.close();
            return;
        }
        if (input === ".help" || input === ".h") {
            print.info("REPL Commands:");
            print.info("  .help, .h     Show this help");
            print.info("  .exit, .q     Exit the REPL");
            print.info("  .clear        Clear the screen");
            print.info("  .ping         Check server connectivity");
            print.info("");
            print.info("Run any mark command without 'mark' prefix:");
            print.info("  server status");
            print.info("  lib list");
            print.info("  shell exec \"ls -la\"");
            rl.prompt();
            return;
        }
        if (input === ".clear") {
            console.clear();
            rl.prompt();
            return;
        }
        if (input === ".ping") {
            const start = Date.now();
            try {
                const response = await fetch(`${serverInfo.endpoint}/health`);
                const data = await response.json();
                print.success(`Pong! ${Date.now() - start}ms - ${data.procedures} procedures`);
            }
            catch (err) {
                print.error(`Server not responding: ${err instanceof Error ? err.message : String(err)}`);
            }
            rl.prompt();
            return;
        }
        if (input === "") {
            rl.prompt();
            return;
        }
        // Parse and execute command
        const parsed = parseReplInput(input, procedures);
        if (!parsed || parsed.path.length === 0) {
            print.error("Invalid command. Type .help for help.");
            rl.prompt();
            return;
        }
        const proc = procedures.find((p) => p.path.length === parsed.path.length && p.path.every((seg, i) => seg === parsed.path[i]));
        if (!proc) {
            print.error(`Unknown command: ${parsed.path.join(" ")}`);
            rl.prompt();
            return;
        }
        try {
            const start = Date.now();
            // Parse input using procedure metadata
            const meta = (proc.metadata ?? {});
            const parameters = { array: parsed.args, options: parsed.options };
            let cmdInput = parseFromSchema(parameters, meta);
            // Validate if schema exists
            if (proc.input) {
                cmdInput = proc.input.parse(cmdInput);
            }
            const result = await executeCommand(serverInfo.endpoint, parsed.path, cmdInput);
            const elapsed = Date.now() - start;
            // Format output
            const outputFormat = (meta.output ?? "text");
            formatOutput(print, result, outputFormat);
            if (verbose) {
                print.info(`(${elapsed}ms)`);
            }
        }
        catch (err) {
            print.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        }
        rl.prompt();
    });
    rl.on("close", () => {
        if (serverProcess && serverInfo.ownedByUs) {
            print.info("\nStopping server...");
            serverProcess.kill("SIGTERM");
        }
        print.info("Goodbye!");
        process.exit(0);
    });
}
//# sourceMappingURL=repl.js.map