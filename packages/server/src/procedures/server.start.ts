/**
 * Procedure: server.start
 *
 * This procedure starts the CLI server (`mark --server`) as a background process. Then it waits
 * for the readiness of the server (CLI-9). It stops the wait as soon as the server is ready or the
 * process exits. At the timeout, it gives `success: false` with the PID of the process.
 *
 * The procedure came from `@procedures/peer`: it belongs to the host. The lockfiles stay in the
 * peer package, because the peer of `mark --server` writes them.
 */

import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createProcedure, type Effects, type FsRootRules, type Procedure } from "@procedures/client";
import { HOST_PROBE_PREFIX } from "@procedures/peer";
import { checkServer, readLockfileForPort, type LockfileData } from "@procedures/peer/lockfile";
import { ServerStartOutputSchema, serverStartInputSchema } from "../schemas.js";
import type { ServerStartInput, ServerStartOutput } from "../types.js";

const MARK_DIR = path.join(os.homedir(), ".mark");
const SERVERS_DIR = path.join(MARK_DIR, "servers");
const LOG_PATH = path.join(MARK_DIR, "server.log");
const LOG_PREV_PATH = path.join(MARK_DIR, "server.log.1");


/** The default time to wait for the readiness of the server: 15 s. */
export const SERVER_START_TIMEOUT_MS = 15_000;

/** The time between two reads of the readiness probe. */
const POLL_INTERVAL_MS = 250;

/** The time that one read of the probe or of `host.info` can take. */
const READ_TIMEOUT_MS = 1_000;

/** The end of the process of the server: its exit code and its signal, or the error of its spawn. */
type ChildEnd = { readonly code: number | null; readonly signal: NodeJS.Signals | null } | { readonly error: Error };

/** This function gives a promise of the end of a process. For a process that ended before, `exitCode` gives the end. */
function endOf(child: ChildProcess): Promise<ChildEnd> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    child.once("exit", (code, signal) => resolve({ code, signal }));
    child.once("error", (error) => resolve({ error }));
  });
}

/** The text of the end of a process, for the message of a failed start. */
function endText(end: ChildEnd): string {
  if ("error" in end) return `did not start (${end.error.message})`;
  if (end.signal !== null) return `stopped at the signal ${end.signal}`;
  return `exited with the code ${end.code ?? "unknown"}`;
}

/** The URL of the readiness probe on the listener of a server (CLI-9). An address of all interfaces gives loopback. */
export function readinessUrl(host: string, port: number): string {
  const target = host === "0.0.0.0" ? "127.0.0.1" : host === "::" ? "::1" : host;
  const shown = target.includes(":") && !target.startsWith("[") ? `[${target}]` : target;
  return `http://${shown}:${port}${HOST_PROBE_PREFIX}/readiness`;
}

/**
 * The state of the readiness probe: `ready` (200), `starting` (503, or no answer yet), or `absent`
 * (another status: the listener has no probes, for example a build of `mark` before CLI-9).
 */
async function readProbe(url: string): Promise<"ready" | "starting" | "absent"> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
    await response.arrayBuffer();
    if (response.status === 200) return "ready";
    return response.status === 503 ? "starting" : "absent";
  } catch {
    return "starting";
  }
}

/**
 * The lockfile of the new server, when `host.info` answers its token with its peer id. A lockfile
 * with the peer id `before` is from before the spawn, thus it is not the lockfile of the new server.
 */
async function newServer(port: number, before: string | undefined): Promise<LockfileData | undefined> {
  const lockfile = readLockfileForPort(port);
  if (lockfile === null || lockfile.peerId === undefined || lockfile.peerId === before) return undefined;
  return (await checkServer(lockfile, READ_TIMEOUT_MS)) === "alive" ? lockfile : undefined;
}

/** What the wait for the server gives: the lockfile of the ready server, the end of its process, or the timeout. */
type WaitResult = { readonly ready: LockfileData } | { readonly end: ChildEnd } | { readonly timedOut: true };

/**
 * This function waits until the new server is ready, until its process ends, or until the timeout (CLI-9).
 *
 * - The readiness probe of the listener (`/_probes/readiness`) tells when the service is ready.
 * - The probe has no identity: another server on the port can answer it. Thus a ready probe also
 *   needs the lockfile of the new server, and `host.info` must answer its token with its peer id.
 * - A listener without probes (a build of `mark` before CLI-9) answers 404. Then `host.info` alone
 *   tells the readiness, because the service refuses each call until its startup ends.
 * - The wait stops at once when the process ends.
 */
async function waitForServer(options: {
  readonly url: string;
  readonly port: number;
  readonly before: string | undefined;
  readonly end: Promise<ChildEnd>;
  readonly timeoutMs: number;
}): Promise<WaitResult> {
  let ended: ChildEnd | undefined;
  void options.end.then((end) => (ended = end));
  const deadline = Date.now() + options.timeoutMs;
  for (;;) {
    if (ended !== undefined) return { end: ended };
    if ((await readProbe(options.url)) !== "starting") {
      const ready = await newServer(options.port, options.before);
      if (ready !== undefined) return { ready };
    }
    if (ended !== undefined) return { end: ended };
    const left = deadline - Date.now();
    if (left <= 0) return { timedOut: true };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pause = new Promise<void>((resolve) => (timer = setTimeout(resolve, Math.min(POLL_INTERVAL_MS, left))));
    await Promise.race([options.end, pause]);
    clearTimeout(timer);
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
 * True when a script is the `mark` CLI: `dist/bin.js` (its bin) or `dist/cli.js` of the package
 * `@procedures/mark`, or of the folder `packages/mark`. Another program with a `dist/cli.js`, for
 * example `procedure-server`, is not `mark` (audit s21).
 */
function isMarkCli(script: string): boolean {
  // Normalize path for cross-platform check
  return /\/mark\/dist\/(?:bin|cli)\.js$/.test(script.replace(/\\/g, "/"));
}

/**
 * Find the CLI entry point. Each script that it gives is the `mark` CLI (`isMarkCli`). Before, it
 * took each script whose name ends in `cli.js`, so a start in another program started that
 * program (audit s21).
 */
export function findCliPath(): string {
  // First, try to use the currently running script if it's the CLI
  const currentScript = process.argv[1];
  if (currentScript && isMarkCli(currentScript)) {
    // Return absolute path
    return path.resolve(currentScript);
  }

  // Try to find the mark CLI in node_modules or as a direct path
  const candidates = [
    path.join(process.cwd(), "node_modules", "@procedures", "mark", "dist", "cli.js"),
    path.join(process.cwd(), "node_modules", ".bin", "mark"),
    // Check parent directories for monorepo setups: the folder packages/mark
    path.join(process.cwd(), "..", "mark", "dist", "cli.js"),
    // Direct check in current directory: only the folder of mark
    path.join(process.cwd(), "dist", "cli.js"),
  ];

  // Check which candidate exists
  for (const candidate of candidates) {
    if ((!candidate.endsWith(".js") || isMarkCli(candidate)) && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback: try mark in PATH (will fail if not installed globally)
  return "mark";
}

/** The function that starts a process. The default is `spawn` of `node:child_process`. The tests give their own. */
export type ServerSpawner = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

const defaultSpawner: ServerSpawner = (command, args, options) => spawn(command, [...args], options);

/** The options of `spawnMarkServer()`. */
export interface MarkServerSpawn {
  readonly port: number;
  /** The address of the listener. */
  readonly host: string;
  /** The transport. The default is `http`. */
  readonly transport?: "http" | "websocket" | "both" | undefined;
  /** The idle stop of the server, in milliseconds (`--idle-timeout`, CLI-27). Without it, the server has no idle stop. */
  readonly idleTimeoutMs?: number | undefined;
  /** The root of the `fs.*` procedures of the server (`--fs-root`). Without it, the server has no root. */
  readonly fsRoot?: string | undefined;
  /** The function that starts the process. The default is `spawn`. */
  readonly spawner?: ServerSpawner | undefined;
}

/** The process of a server that `spawnMarkServer()` started, and the command line of the process. */
export interface SpawnedMarkServer {
  readonly child: ChildProcess;
  readonly command: string;
  readonly args: readonly string[];
  /** The log file of the server: its standard output and its standard error. */
  readonly logFile: string;
}

/**
 * This function starts `mark --server` as a detached background process in the current folder,
 * and gives the process at once. It does not wait for the readiness. `server.start` and the
 * auto-warm of `mark` (CLI-27) use it.
 *
 * - The command line is the command that a user runs: `mark --server --port <port> --host <host>`.
 * - The output goes to `~/.mark/server.log`. The old log moves to `server.log.1`.
 * - The process is detached and unref'd, so the caller can exit at once.
 * - An error of the spawn goes to the event `error` of the process, and it does not throw.
 *
 * This function does not use `runCommand()` or `shell.run`. They wait for the end of the process,
 * and this process must outlive its caller. `SERVER-LAYERS.md` records the exception.
 */
export function spawnMarkServer(options: MarkServerSpawn): SpawnedMarkServer {
  const transport = options.transport ?? "http";

  // Rotate log file
  rotateLog();

  // Ensure directories exist
  fs.mkdirSync(SERVERS_DIR, { recursive: true });

  // Open log file for writing
  const logFd = fs.openSync(LOG_PATH, "a");

  // Find CLI path
  const cliPath = findCliPath();

  // Build arguments: the root is a global flag, before --server
  const args = [
    ...(options.fsRoot !== undefined ? ["--fs-root", options.fsRoot] : []),
    "--server",
    "--port",
    String(options.port),
    "--host",
    options.host,
  ];
  if (transport !== "http") {
    args.push("--transport", transport);
  }
  if (options.idleTimeoutMs !== undefined) {
    args.push("--idle-timeout", String(options.idleTimeoutMs));
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
  let child: ChildProcess;
  try {
    child = (options.spawner ?? defaultSpawner)(spawnCmd, spawnArgs, {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: { ...process.env },
      cwd: process.cwd(),
      // No console window on Windows (deep dive CLI-16)
      windowsHide: true,
    });
  } finally {
    fs.closeSync(logFd);
  }
  // A spawn that fails, for example without `mark` in PATH, emits "error". Without a listener,
  // the event ends the process of the caller.
  child.once("error", () => undefined);

  // Unref so parent can exit
  child.unref();
  return { child, command: spawnCmd, args: spawnArgs, logFile: LOG_PATH };
}

/**
 * The rule under a root of the files (roadmap R33, tracker item O36): a root refuses it. It starts
 * a mark server without the root, and it writes the log and the lock files in `~/.mark`.
 */
const START_UNDER_A_ROOT: FsRootRules = {
  refuse: "it starts a mark server process without the root, and it writes the log and the lock files in the home folder (~/.mark)",
};

export const serverStartProcedure: Procedure<
  ServerStartInput,
  ServerStartOutput,
  { description: string; effects: Effects; args: string[]; shorts: Record<string, string>; fsRoot: FsRootRules }
> = createProcedure()
  .path(["server", "start"])
  .input(serverStartInputSchema)
  .output(ServerStartOutputSchema)
  .meta({
    description: "Start CLI server as background daemon",
    // The daemon loads the procedure packages of the workspace. The procedure moves server.log
    // over server.log.1.
    effects: { reads: ["fs", "server"], writes: ["fs", "network", "process", "server"] },
    fsRoot: START_UNDER_A_ROOT,
    args: [],
    shorts: { port: "p", host: "h" },
  })
  .handler(async (input: ServerStartInput): Promise<ServerStartOutput> => {
    const port = input.port ?? 3000;
    // Loopback by default; pass host: "0.0.0.0" to expose on the LAN deliberately.
    // See documentation/BUGS-2026-07.md (H19).
    const host = input.host ?? "127.0.0.1";
    const transport = input.transport ?? "http";
    const timeoutMs = input.timeout ?? SERVER_START_TIMEOUT_MS;

    // Check if server is already running on this port
    const existing = readLockfileForPort(port);
    if (existing && (await checkServer(existing)) === "alive") {
      return {
        success: false,
        message: `Server already running on port ${port} (PID ${existing.pid})`,
      };
    }

    // The detached process of the server, with its log (CLI-27 shares this start with the auto-warm of mark)
    const { child } = spawnMarkServer({ port, host, transport });
    // The end of the process stops the wait. The listener of "error" also catches a spawn that
    // fails, for example without `mark` in PATH.
    const end = endOf(child);

    // The wait for the readiness (CLI-9): the readiness probe, and host.info for the identity of the server
    const result = await waitForServer({ url: readinessUrl(host, port), port, before: existing?.peerId, end, timeoutMs });
    if ("ready" in result) {
      return {
        success: true,
        pid: result.ready.pid,
        port: result.ready.port,
        endpoint: result.ready.endpoint,
        logFile: LOG_PATH,
        message: `Server started (PID ${result.ready.pid})`,
      };
    }
    const pid = child.pid;
    if ("end" in result) {
      return {
        success: false,
        ...(pid !== undefined ? { pid } : {}),
        logFile: LOG_PATH,
        message: `The server process${pid !== undefined ? ` (PID ${pid})` : ""} ${endText(result.end)} before it was ready. Check ${LOG_PATH} for details.`,
      };
    }
    // The timeout: the process still starts, but the server is not ready. Thus the start failed (CLI-9).
    return {
      success: false,
      ...(pid !== undefined ? { pid } : {}),
      port,
      logFile: LOG_PATH,
      message: `The server is not ready after ${timeoutMs} ms. Its process (PID ${pid ?? "unknown"}) still starts: check ${LOG_PATH}, and run 'mark server status' later.`,
    };
  })
  .build();

export type { ServerStartInput, ServerStartOutput };
