/**
 * Procedure: server.status
 * Gets the current CLI server status
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createProcedure, type Procedure } from "@mark1russell7/client";
import { schema } from "../schema.js";
import type { ServerStatusInput, ServerStatusOutput } from "../types.js";

// Lockfile paths (same as cli/src/lockfile.ts)
const LOCKFILE_DIR = path.join(os.homedir(), ".mark");
const LOCKFILE_PATH = path.join(LOCKFILE_DIR, "server.lock");
const LOG_PATH = path.join(LOCKFILE_DIR, "server.log");

const serverStatusInputSchema = schema<ServerStatusInput>();
const serverStatusOutputSchema = schema<ServerStatusOutput>();

interface LockfileData {
  pid: number;
  port: number;
  transport: string;
  endpoint: string;
  startedAt: string;
}

/**
 * Read lockfile synchronously
 */
function readLockfileSync(): LockfileData | null {
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
 * Format uptime as human-readable string
 */
function formatUptime(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diff = Math.floor((now - start) / 1000);

  if (diff < 60) {
    return `${diff}s`;
  }
  if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return `${mins}m ${secs}s`;
  }
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  return `${days}d ${hours}h`;
}

export const serverStatusProcedure: Procedure<
  ServerStatusInput,
  ServerStatusOutput,
  { description: string; output: string }
> = createProcedure()
  .path(["server", "status"])
  .input(serverStatusInputSchema)
  .output(serverStatusOutputSchema)
  .meta({
    description: "Get CLI server status",
    output: "text",
  })
  .handler(async (_input: ServerStatusInput): Promise<ServerStatusOutput> => {
    // Read lockfile
    const lockfile = readLockfileSync();

    if (!lockfile) {
      return {
        running: false,
        message: "Server is not running",
      };
    }

    const { pid, port, endpoint, startedAt, transport } = lockfile;

    // Check if process is actually running
    if (!isProcessAlive(pid)) {
      // Clean up stale lockfile
      removeLockfile();
      return {
        running: false,
        message: "Server is not running (cleaned up stale lockfile)",
      };
    }

    // Server is running
    const uptime = formatUptime(startedAt);

    return {
      running: true,
      pid,
      port,
      endpoint,
      transport,
      startedAt,
      uptime,
      logFile: LOG_PATH,
      message: `Server running (PID ${pid}, port ${port}, uptime ${uptime})`,
    };
  })
  .build();

export type { ServerStatusInput, ServerStatusOutput };
