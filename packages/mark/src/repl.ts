/**
 * Interactive REPL Mode
 *
 * Starts an interactive session with fast command execution via HTTP.
 * By default, starts its own server on a random port.
 * Use --connect to connect to an existing server.
 */

import * as readline from "node:readline";
import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import { print } from "./print.js";
import { readLockfile, isServerAlive } from "./lockfile.js";

export interface ReplOptions {
  /** Connect to existing server instead of starting one */
  connect?: boolean | undefined;
  /** Port to connect to (with --connect) or start on */
  port?: number | undefined;
  /** Verbose output */
  verbose?: boolean | undefined;
}

interface ServerInfo {
  endpoint: string;
  pid?: number;
  ownedByUs: boolean;
}

/**
 * Find an available port
 */
async function findAvailablePort(): Promise<number> {
  const net = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error("Failed to get port"));
      }
    });
    server.on("error", reject);
  });
}

/**
 * Start a server process on the given port
 */
async function startServerProcess(port: number, verbose: boolean): Promise<ChildProcess> {
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
  await new Promise<void>((resolve, reject) => {
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
      } catch {
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
async function executeCommand(
  endpoint: string,
  path: string[],
  input: Record<string, unknown>
): Promise<unknown> {
  const url = `${endpoint}/${path.join("/")}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const result = await response.json() as Record<string, unknown>;

  if (!response.ok && result["error"]) {
    throw new Error(String(result["error"]));
  }

  return result;
}

/**
 * Parse REPL input into command path and arguments
 * Does NOT validate against local procedures - sends to server for validation
 */
function parseReplInput(
  input: string
): { path: string[]; args: string[]; options: Record<string, unknown> } | null {
  const tokens = input.trim().split(/\s+/);
  if (tokens.length === 0 || tokens[0] === "") {
    return null;
  }

  const path: string[] = [];
  const args: string[] = [];
  const options: Record<string, unknown> = {};

  let i = 0;

  // Collect path segments (non-option tokens until we hit options or run out)
  // We collect up to 3 segments as path (service.operation.subop), rest are args
  while (i < tokens.length && path.length < 3) {
    const token = tokens[i];
    if (!token || token.startsWith("-")) break;
    path.push(token);
    i++;
  }

  // If we have more non-option tokens after 3 path segments, they're positional args
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
      } else {
        const key = token.slice(2);
        const next = tokens[i + 1];
        if (next && !next.startsWith("-")) {
          options[key] = next;
          i++;
        } else {
          options[key] = true;
        }
      }
    } else if (token.startsWith("-") && token.length === 2) {
      const key = token.slice(1);
      const next = tokens[i + 1];
      if (next && !next.startsWith("-")) {
        options[key] = next;
        i++;
      } else {
        options[key] = true;
      }
    } else {
      args.push(token);
    }
    i++;
  }

  return { path, args, options };
}

/**
 * Start the interactive REPL
 */
export async function startRepl(options: ReplOptions): Promise<void> {
  const { connect = false, port: specifiedPort, verbose = false } = options;

  let serverInfo: ServerInfo;
  let serverProcess: ChildProcess | undefined;

  if (connect) {
    // Connect to existing server
    if (specifiedPort) {
      serverInfo = {
        endpoint: `http://localhost:${specifiedPort}/api`,
        ownedByUs: false,
      };
    } else {
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
  } else {
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
        const data = await response.json() as { procedures: number };
        print.success(`Pong! ${Date.now() - start}ms - ${data.procedures} procedures`);
      } catch (err) {
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
    const parsed = parseReplInput(input);
    if (!parsed || parsed.path.length === 0) {
      print.error("Invalid command. Type .help for help.");
      rl.prompt();
      return;
    }

    try {
      const start = Date.now();

      // Build input from positional args and options
      // Server will handle validation
      const cmdInput: Record<string, unknown> = { ...parsed.options };
      if (parsed.args.length > 0) {
        cmdInput["_args"] = parsed.args;
      }

      const result = await executeCommand(serverInfo.endpoint, parsed.path, cmdInput);
      const elapsed = Date.now() - start;

      // Output as JSON (server decides format)
      if (typeof result === "object" && result !== null) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result);
      }

      if (verbose) {
        print.info(`(${elapsed}ms)`);
      }
    } catch (err) {
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
