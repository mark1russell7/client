/**
 * The lockfiles of the CLI servers: one module for `mark` and the `server.*` procedures.
 *
 * `mark --server` writes `~/.mark/servers/<port>.lock` with its token, the folder it runs in,
 * the build of `mark` and its peer id. Before, five copies of this logic had drifted, and a
 * server counted as alive when its PID existed: Windows reuses PIDs, so a stale lockfile broke
 * every `mark` command and `server stop` killed an unrelated process (deep dive CLI-4). Now a
 * server is alive only when its health endpoint answers with the peer id of its lockfile.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface LockfileData {
  pid: number;
  port: number;
  transport: string;
  endpoint: string;
  startedAt: string;
  /** The secret that every request must send (`Authorization: Bearer <token>`). An older lockfile has none. */
  token?: string;
  /** The folder the server runs in: relative paths and default `cwd` values resolve there */
  cwd?: string;
  /** The build of `mark` that runs the server */
  build?: string;
  /** The peer id that the server's health endpoint answers */
  peerId?: string;
}

const MARK_DIR = path.join(os.homedir(), ".mark");
const SERVERS_DIR = path.join(MARK_DIR, "servers");
// The single lockfile of older versions: it is read only to remove it
const LEGACY_LOCKFILE_PATH = path.join(MARK_DIR, "server.lock");

export function getMarkDir(): string {
  return MARK_DIR;
}

export function getServersDir(): string {
  return SERVERS_DIR;
}

function lockfilePath(port: number): string {
  return path.join(SERVERS_DIR, `${port}.lock`);
}

/** This function writes a lockfile that only its user can read (it holds the token). */
export function writeLockfile(data: LockfileData): void {
  fs.mkdirSync(SERVERS_DIR, { recursive: true });
  fs.writeFileSync(lockfilePath(data.port), JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function readLockfileForPort(port: number): LockfileData | null {
  try {
    return JSON.parse(fs.readFileSync(lockfilePath(port), "utf-8")) as LockfileData;
  } catch {
    return null;
  }
}

export function readAllLockfiles(): LockfileData[] {
  const results: LockfileData[] = [];
  let files: string[] = [];
  try {
    files = fs.readdirSync(SERVERS_DIR);
  } catch {
    return results; // The folder does not exist yet
  }
  for (const file of files) {
    if (!file.endsWith(".lock")) continue;
    try {
      results.push(JSON.parse(fs.readFileSync(path.join(SERVERS_DIR, file), "utf-8")) as LockfileData);
    } catch {
      // Skip a corrupt lockfile
    }
  }
  return results;
}

export function removeLockfileForPort(port: number): void {
  try {
    fs.unlinkSync(lockfilePath(port));
  } catch {
    // Already gone
  }
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_LOCKFILE_PATH, "utf-8")) as LockfileData;
    if (legacy.port === port) fs.unlinkSync(LEGACY_LOCKFILE_PATH);
  } catch {
    // No legacy lockfile
  }
}

/**
 * The state of a lockfile's server:
 * - "alive": the health endpoint answers with the lockfile's peer id;
 * - "dead": nothing answers (the lockfile is stale);
 * - "other": something else answers on the port (another server, or a lockfile without a peer id).
 */
export async function checkServer(lockfile: LockfileData, timeoutMs = 1000): Promise<"alive" | "dead" | "other"> {
  let response: Response;
  try {
    response = await fetch(`${lockfile.endpoint}/health`, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return "dead";
  }
  try {
    const health = (await response.json()) as { peerId?: unknown };
    return lockfile.peerId !== undefined && health.peerId === lockfile.peerId ? "alive" : "other";
  } catch {
    return "other";
  }
}

/**
 * The lockfile of a running server that this caller can use: it has a token, it runs in `cwd`
 * with the build `build`, and it answers as the peer of its lockfile. A dead server's lockfile
 * is removed.
 */
export async function findServer(match: { cwd: string; build: string }): Promise<LockfileData | null> {
  for (const lockfile of readAllLockfiles()) {
    if (!lockfile.token || lockfile.cwd !== match.cwd || lockfile.build !== match.build) continue;
    const state = await checkServer(lockfile);
    if (state === "alive") return lockfile;
    if (state === "dead") removeLockfileForPort(lockfile.port);
  }
  return null;
}
