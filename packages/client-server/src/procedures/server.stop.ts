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
const LOCKFILE_DIR = path.join(os.homedir(), ".mark");
const LOCKFILE_PATH = path.join(LOCKFILE_DIR, "server.lock");

const serverStopInputSchema = schema<ServerStopInput>();
const serverStopOutputSchema = schema<ServerStopOutput>();

/**
 * Read lockfile synchronously
 */
function readLockfileSync(): { pid: number; port: number; endpoint: string; startedAt: string } | null {
  try {
    const content = fs.readFileSync(LOCKFILE_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Remove lockfile
 */
function removeLockfile(): void {
  try {
    fs.unlinkSync(LOCKFILE_PATH);
  } catch {
    // Ignore if doesn't exist
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
  })
  .handler(async (input: ServerStopInput): Promise<ServerStopOutput> => {
    const force = input.force ?? false;

    // Read lockfile
    const lockfile = readLockfileSync();

    if (!lockfile) {
      return {
        success: false,
        message: "No server lockfile found. Server may not be running.",
      };
    }

    const { pid, port } = lockfile;

    // Check if process is running
    if (!isProcessAlive(pid)) {
      // Clean up stale lockfile
      removeLockfile();
      return {
        success: true,
        message: `Server not running (stale lockfile cleaned up)`,
      };
    }

    // Send signal to stop
    const signal = force ? "SIGKILL" : "SIGTERM";
    const sent = killProcess(pid, signal);

    if (!sent) {
      return {
        success: false,
        message: `Failed to send ${signal} to process ${pid}`,
      };
    }

    // Wait for process to die (up to 5 seconds for SIGTERM, immediate for SIGKILL)
    const maxWait = force ? 500 : 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      if (!isProcessAlive(pid)) {
        // Process stopped, clean up lockfile
        removeLockfile();
        return {
          success: true,
          message: `Server stopped (PID ${pid}, port ${port})`,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Process didn't stop with SIGTERM, suggest force
    if (!force) {
      return {
        success: false,
        message: `Server (PID ${pid}) did not stop gracefully. Use --force to kill.`,
      };
    }

    // If we sent SIGKILL and it's still running, something is wrong
    return {
      success: false,
      message: `Failed to kill server (PID ${pid})`,
    };
  })
  .build();

export type { ServerStopInput, ServerStopOutput };
