/**
 * Lockfiles of the CLI server: `mark` uses the shared module of `client-server`, so `mark` and the
 * `server.*` procedures read and write the same files the same way (deep dive CLI-4). This module
 * adds what only `mark` needs: the log file and the build id.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkServer,
  findServer,
  getMarkDir,
  getServersDir,
  readAllLockfiles,
  readLockfileForPort,
  removeLockfileForPort,
  writeLockfile as writeSharedLockfile,
  type LockfileData,
} from "@mark1russell7/client-server/lockfile";

export type { LockfileData };
export { checkServer, findServer, readAllLockfiles, readLockfileForPort, removeLockfileForPort };

const LOG_PATH = path.join(getMarkDir(), "server.log");
const LOG_PREV_PATH = path.join(getMarkDir(), "server.log.1");

/**
 * The build of this `mark`: its file and the time of its last build. A warm server runs only the
 * commands of the same build (deep dive CLI-14): after `pnpm build`, or from another checkout,
 * the CLI runs the command itself.
 */
export function currentBuild(): string {
  const file = fileURLToPath(import.meta.url);
  try {
    return `${file}@${fs.statSync(file).mtimeMs}`;
  } catch {
    return file;
  }
}

export async function writeLockfile(data: LockfileData): Promise<void> {
  writeSharedLockfile(data);
}

/** The first lockfile whose server answers as its peer (any folder, any build). */
export async function readLockfile(): Promise<LockfileData | null> {
  for (const data of readAllLockfiles()) {
    if (await isServerAlive(data)) return data;
  }
  return null;
}

/** True when the lockfile's server answers as its peer. A dead server's lockfile is removed. */
export async function isServerAlive(lockfile: LockfileData): Promise<boolean> {
  const state = await checkServer(lockfile);
  if (state === "dead") removeLockfileForPort(lockfile.port);
  return state === "alive";
}

/** This function removes the lockfile of the default port (3000). */
export async function removeLockfile(): Promise<void> {
  removeLockfileForPort(3000);
}

export function getLockfileDir(): string {
  return getMarkDir();
}

export function getLockfilePath(): string {
  return getServersDir();
}

export function getLogPath(): string {
  return LOG_PATH;
}

export async function rotateLogFile(): Promise<void> {
  try {
    fs.mkdirSync(getMarkDir(), { recursive: true });
    if (fs.existsSync(LOG_PATH)) fs.renameSync(LOG_PATH, LOG_PREV_PATH);
  } catch {
    // Ignore rotation errors
  }
}
