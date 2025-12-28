/**
 * Lockfile Utilities for client-cli
 *
 * Checks for running CLI server via ~/.mark/server.lock
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

export interface LockfileData {
  pid: number;
  port: number;
  transport: string;
  endpoint: string;
  startedAt: string;
}

const LOCKFILE_PATH = path.join(os.homedir(), ".mark", "server.lock");

/**
 * Read server lockfile
 */
export async function readLockfile(): Promise<LockfileData | null> {
  try {
    const content = await fs.readFile(LOCKFILE_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Check if server process is still alive
 */
export async function isServerAlive(lockfile: LockfileData): Promise<boolean> {
  try {
    // Check if process is running by sending signal 0
    process.kill(lockfile.pid, 0);
    return true;
  } catch {
    return false;
  }
}
