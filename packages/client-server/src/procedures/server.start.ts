/**
 * Procedure: server.start
 * Starts the CLI server as a background daemon
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createProcedure, type Procedure } from "@mark1russell7/client";
import { schema } from "../schema.js";
import type { ServerStartInput, ServerStartOutput } from "../types.js";

// Lockfile paths (same as cli/src/lockfile.ts)
const MARK_DIR = path.join(os.homedir(), ".mark");
const SERVERS_DIR = path.join(MARK_DIR, "servers");
const LEGACY_LOCKFILE_PATH = path.join(MARK_DIR, "server.lock");
const LOG_PATH = path.join(MARK_DIR, "server.log");
const LOG_PREV_PATH = path.join(MARK_DIR, "server.log.1");

const serverStartInputSchema = schema<ServerStartInput>();
const serverStartOutputSchema = schema<ServerStartOutput>();

/**
 * Read lockfile for a specific port
 */
function readLockfileForPort(port: number): { pid: number; port: number; endpoint: string; startedAt: string } | null {
  try {
    const content = fs.readFileSync(path.join(SERVERS_DIR, `${port}.lock`), "utf-8");
    return JSON.parse(content);
  } catch {
    // Try legacy lockfile
    try {
      const content = fs.readFileSync(LEGACY_LOCKFILE_PATH, "utf-8");
      const data = JSON.parse(content);
      if (data.port === port) return data;
    } catch {
      // No lockfile
    }
    return null;
  }
}

/**
 * Check if process is alive
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Rotate log file
 */
function rotateLog(): void {
  try {
    fs.mkdirSync(MARK_DIR, { recursive: true });
    if (fs.existsSync(LOG_PATH)) {
      fs.renameSync(LOG_PATH, LOG_PREV_PATH);
    }
  } catch {
    // Ignore rotation errors
  }
}

/**
 * Find the CLI entry point
 */
function findCliPath(): string {
  // First, try to use the currently running script if it's the CLI
  const currentScript = process.argv[1];
  if (currentScript) {
    // Normalize path for cross-platform check
    const normalized = currentScript.replace(/\\/g, "/");
    if (normalized.endsWith("cli.js") || normalized.includes("cli/dist")) {
      // Return absolute path
      return path.resolve(currentScript);
    }
  }

  // Try to find the mark CLI in node_modules or as a direct path
  const candidates = [
    path.join(process.cwd(), "node_modules", "@mark1russell7", "cli", "dist", "cli.js"),
    path.join(process.cwd(), "node_modules", ".bin", "mark"),
    // Check parent directories for monorepo setups
    path.join(process.cwd(), "..", "cli", "dist", "cli.js"),
    // Direct check in current directory
    path.join(process.cwd(), "dist", "cli.js"),
  ];

  // Check which candidate exists
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback: try mark in PATH (will fail if not installed globally)
  return "mark";
}

export const serverStartProcedure: Procedure<
  ServerStartInput,
  ServerStartOutput,
  { description: string; args: string[]; shorts: Record<string, string> }
> = createProcedure()
  .path(["server", "start"])
  .input(serverStartInputSchema)
  .output(serverStartOutputSchema)
  .meta({
    description: "Start CLI server as background daemon",
    args: [],
    shorts: { port: "p", host: "h" },
  })
  .handler(async (input: ServerStartInput): Promise<ServerStartOutput> => {
    const port = input.port ?? 3000;
    // Loopback by default; pass host: "0.0.0.0" to expose on the LAN deliberately.
    // See documentation/BUGS-2026-07.md (H19).
    const host = input.host ?? "127.0.0.1";
    const transport = input.transport ?? "http";

    // Check if server is already running on this port
    const existing = readLockfileForPort(port);
    if (existing && isProcessAlive(existing.pid)) {
      return {
        success: false,
        message: `Server already running on port ${port} (PID ${existing.pid})`,
      };
    }

    // Rotate log file
    rotateLog();

    // Ensure directories exist
    fs.mkdirSync(SERVERS_DIR, { recursive: true });

    // Open log file for writing
    const logFd = fs.openSync(LOG_PATH, "a");

    // Find CLI path
    const cliPath = findCliPath();

    // Build arguments
    const args = ["--server", "--port", String(port), "--host", host];
    if (transport !== "http") {
      args.push("--transport", transport);
    }

    // Determine how to spawn
    let spawnCmd: string;
    let spawnArgs: string[];

    if (cliPath === "mark" || cliPath.endsWith(".bin/mark") || cliPath.endsWith(".bin\\mark")) {
      // Use mark command directly
      spawnCmd = cliPath;
      spawnArgs = args;
    } else {
      // Use node to run the JS file
      spawnCmd = process.execPath;
      spawnArgs = [cliPath, ...args];
    }

    // Spawn daemon process
    const child = spawn(spawnCmd, spawnArgs, {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: { ...process.env },
      cwd: process.cwd(),
    });

    // Unref so parent can exit
    child.unref();
    fs.closeSync(logFd);

    // Poll for lockfile (server takes ~4-8s to load ecosystem)
    const maxWait = 15000;
    const pollInterval = 500;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      // Check if child died
      if (child.pid && !isProcessAlive(child.pid)) {
        break;
      }

      // Check for lockfile
      const lockfile = readLockfileForPort(port);
      if (lockfile && isProcessAlive(lockfile.pid)) {
        return {
          success: true,
          pid: lockfile.pid,
          port: lockfile.port,
          endpoint: lockfile.endpoint,
          logFile: LOG_PATH,
          message: `Server started (PID ${lockfile.pid})`,
        };
      }
    }

    // Timed out waiting for lockfile, but child may still be alive
    if (child.pid && isProcessAlive(child.pid)) {
      return {
        success: true,
        pid: child.pid,
        port,
        endpoint: `http://${host === "0.0.0.0" ? "localhost" : host}:${port}/api`,
        logFile: LOG_PATH,
        message: `Server starting (PID ${child.pid}, still loading...)`,
      };
    }

    return {
      success: false,
      message: `Failed to start server. Check ${LOG_PATH} for details.`,
    };
  })
  .build();

export type { ServerStartInput, ServerStartOutput };
