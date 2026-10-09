/**
 * Procedure: server.status
 * Gets the current CLI server status
 */

import * as path from "node:path";
import * as os from "node:os";
import { createProcedure, type Procedure } from "@mark1russell7/client";
import { schema } from "../schema.js";
import { checkServer, readAllLockfiles, readLockfileForPort, removeLockfileForPort, type LockfileData } from "../lockfile.js";
import type { ServerStatusInput, ServerStatusOutput } from "../types.js";

const MARK_DIR = path.join(os.homedir(), ".mark");
const LOG_PATH = path.join(MARK_DIR, "server.log");

const serverStatusInputSchema = schema<ServerStatusInput>();
const serverStatusOutputSchema = schema<ServerStatusOutput>();





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
    args: [],
    shorts: { port: "p" },
    output: "text",
  })
  .handler(async (input: ServerStatusInput): Promise<ServerStatusOutput> => {
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
        running: false,
        message: input.port
          ? `No server found on port ${input.port}`
          : "No servers running",
      };
    }

    // For single server, return detailed info
    if (targets.length === 1) {
      const lockfile = targets[0]!;
      const { pid, port, endpoint, startedAt, transport } = lockfile;

      if ((await checkServer(lockfile)) !== "alive") {
        removeLockfileForPort(port);
        return {
          running: false,
          message: "Server is not running (cleaned up stale lockfile)",
        };
      }

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
    }

    // Multiple servers - summarize
    const lines: string[] = [];
    let anyRunning = false;

    for (const lockfile of targets) {
      const { pid, port, endpoint, startedAt } = lockfile;
      if ((await checkServer(lockfile)) !== "alive") {
        removeLockfileForPort(port);
        continue;
      }
      anyRunning = true;
      const uptime = formatUptime(startedAt);
      lines.push(`  Port ${port}: PID ${pid}, uptime ${uptime}, ${endpoint}`);
    }

    if (!anyRunning) {
      return {
        running: false,
        message: "No servers running (cleaned up stale lockfiles)",
      };
    }

    return {
      running: true,
      message: `${lines.length} server(s) running:\n${lines.join("\n")}`,
    };
  })
  .build();

export type { ServerStatusInput, ServerStatusOutput };
