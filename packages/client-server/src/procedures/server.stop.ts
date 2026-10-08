/**
 * Procedure: server.stop
 * Stops the running CLI server daemon
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createProcedure, type Procedure } from "@mark1russell7/client";
import { schema } from "../schema.js";
import type { ServerStopInput, ServerStopOutput } from "../types.js";

// Lockfile paths (same as cli/src/lockfile.ts)
const MARK_DIR = path.join(os.homedir(), ".mark");
const SERVERS_DIR = path.join(MARK_DIR, "servers");
const LEGACY_LOCKFILE_PATH = path.join(MARK_DIR, "server.lock");

interface LockfileData {
  pid: number;
  port: number;
  endpoint: string;
  startedAt: string;
  transport?: string;
}

const serverStopInputSchema = schema<ServerStopInput>();
const serverStopOutputSchema = schema<ServerStopOutput>();

/**
 * Read lockfile for a specific port
 */
function readLockfileForPort(port: number): LockfileData | null {
  try {
    const content = fs.readFileSync(path.join(SERVERS_DIR, `${port}.lock`), "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Read all server lockfiles
 */
function readAllLockfiles(): LockfileData[] {
  const results: LockfileData[] = [];
  try {
    const files = fs.readdirSync(SERVERS_DIR);
    for (const file of files) {
      if (file.endsWith(".lock")) {
        try {
          const content = fs.readFileSync(path.join(SERVERS_DIR, file), "utf-8");
          results.push(JSON.parse(content));
        } catch {
          // Skip corrupt lockfiles
        }
      }
    }
  } catch {
    // Directory doesn't exist
  }
  // Fallback to legacy lockfile
  if (results.length === 0) {
    try {
      const content = fs.readFileSync(LEGACY_LOCKFILE_PATH, "utf-8");
      results.push(JSON.parse(content));
    } catch {
      // No legacy lockfile
    }
  }
  return results;
}

/**
 * Remove lockfile for a port
 */
function removeLockfileForPort(port: number): void {
  try {
    fs.unlinkSync(path.join(SERVERS_DIR, `${port}.lock`));
  } catch {
    // Ignore
  }
  // Also clean legacy lockfile if it matches
  try {
    const content = fs.readFileSync(LEGACY_LOCKFILE_PATH, "utf-8");
    const data = JSON.parse(content) as LockfileData;
    if (data.port === port) {
      fs.unlinkSync(LEGACY_LOCKFILE_PATH);
    }
  } catch {
    // Ignore
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
 * Kill process by PID
 */
function killProcess(pid: number, signal: NodeJS.Signals = "SIGTERM"): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

export const serverStopProcedure: Procedure<
  ServerStopInput,
  ServerStopOutput,
  { description: string }
> = createProcedure()
  .path(["server", "stop"])
  .input(serverStopInputSchema)
  .output(serverStopOutputSchema)
  .meta({
    description: "Stop running CLI server",
    args: [],
    shorts: { port: "p" },
  })
  .handler(async (input: ServerStopInput): Promise<ServerStopOutput> => {
    const force = input.force ?? false;
    const signal: NodeJS.Signals = force ? "SIGKILL" : "SIGTERM";

    // Get target servers
    let targets: LockfileData[];
    if (input.port !== undefined) {
      const lockfile = readLockfileForPort(input.port);
      targets = lockfile ? [lockfile] : [];
    } else {
      targets = readAllLockfiles();
    }

    if (targets.length === 0) {
      return {
        success: false,
        message: input.port
          ? `No server found on port ${input.port}`
          : "No servers running",
      };
    }

    const results: string[] = [];
    let allSuccess = true;

    for (const lockfile of targets) {
      const { pid, port } = lockfile;

      if (!isProcessAlive(pid)) {
        removeLockfileForPort(port);
        results.push(`Port ${port}: cleaned up stale lockfile`);
        continue;
      }

      const sent = killProcess(pid, signal);
      if (!sent) {
        allSuccess = false;
        results.push(`Port ${port}: failed to send ${signal} to PID ${pid}`);
        continue;
      }

      // Wait for process to die
      const maxWait = force ? 500 : 5000;
      const startTime = Date.now();
      let stopped = false;

      while (Date.now() - startTime < maxWait) {
        if (!isProcessAlive(pid)) {
          removeLockfileForPort(port);
          results.push(`Port ${port}: stopped (PID ${pid})`);
          stopped = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!stopped) {
        allSuccess = false;
        results.push(`Port ${port}: PID ${pid} did not stop${force ? "" : " (try --force)"}`);
      }
    }

    return {
      success: allSuccess,
      message: results.join("\n"),
    };
  })
  .build();

export type { ServerStopInput, ServerStopOutput };
