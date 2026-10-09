/**
 * Process Manager - Manages spawned Node.js processes
 *
 * The manager is a view of the process registry of client-shell, for the group "node"
 * (deep dive WRP-4, WRP-10):
 * - `kill` ends the whole process tree, not only the direct child;
 * - the registry reads the output of each process, so a full pipe does not stop it;
 * - the processes end when the host ends (before, they were detached and kept running);
 * - the registry removes old exit records, and `cleanup` removes the rest.
 */

import { processes, type ManagedProcessInfo } from "@mark1russell7/client-shell/command";
import type { ProcessInfo } from "./types.js";

/** The group of the node processes in the process registry. */
export const NODE_GROUP = "node";

function toProcessInfo(info: ManagedProcessInfo): ProcessInfo {
  const result: ProcessInfo = {
    processId: info.id,
    pid: info.pid,
    script: info.label ?? info.args[0] ?? "",
    status: info.status,
    startedAt: info.startedAt,
  };
  if (info.exitCode !== undefined) result.exitCode = info.exitCode;
  if (info.exitedAt !== undefined) result.exitedAt = info.exitedAt;
  return result;
}

class ProcessManager {
  /**
   * Start a Node.js script and record it
   */
  start(
    script: string,
    options: { args?: string[] | undefined; cwd?: string | undefined; env?: Record<string, string> | undefined }
  ): ProcessInfo {
    const info = processes.start(process.execPath, {
      args: [script, ...(options.args ?? [])],
      cwd: options.cwd,
      env: options.env,
      group: NODE_GROUP,
      label: script,
    });
    return toProcessInfo(info);
  }

  /**
   * Get a managed process by ID
   */
  get(processId: string): ProcessInfo | undefined {
    const info = processes.get(processId);
    return info && info.group === NODE_GROUP ? toProcessInfo(info) : undefined;
  }

  /**
   * Kill a process (and the processes that it started) by ID, and wait for its end
   */
  async kill(processId: string, signal: NodeJS.Signals = "SIGTERM"): Promise<boolean> {
    if (!this.get(processId)) return false;
    return (await processes.stop(processId, signal)).stopped;
  }

  /**
   * Wait for a ready pattern in the output
   */
  async waitForReady(processId: string, pattern: string, timeout: number = 30000): Promise<void> {
    await processes.waitFor(processId, new RegExp(pattern), timeout);
  }

  /**
   * The end of the output of a process (the last 64 KiB)
   */
  output(processId: string): string {
    return this.get(processId) ? processes.output(processId) : "";
  }

  /**
   * Get status of all or specific processes
   */
  getStatus(processId?: string): ProcessInfo[] {
    return processes
      .list({ group: NODE_GROUP })
      .filter((info) => processId === undefined || info.id === processId)
      .map(toProcessInfo);
  }

  /**
   * Cleanup exited processes
   */
  cleanup(): number {
    let cleaned = 0;
    for (const info of processes.list({ group: NODE_GROUP })) {
      if (info.exitedAt && processes.forget(info.id)) cleaned++;
    }
    return cleaned;
  }
}

// Singleton instance
export const processManager: ProcessManager = new ProcessManager();
