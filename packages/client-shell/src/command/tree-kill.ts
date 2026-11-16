/**
 * Kill a child process and all the processes that it started (deep dive WRP-10).
 *
 * `child.kill()` reaches only the direct child. On Windows it calls `TerminateProcess`, so the
 * grandchildren keep running (a `pnpm` that starts `node`, a `vite` that starts `esbuild`).
 * - On Windows, `taskkill /T /F` ends the tree of the process id.
 * - Elsewhere, the child starts in its own process group (`detached`), and a signal to the
 *   negative pid reaches every process of the group. The group can outlive the child: a
 *   descendant keeps it. The signal then goes to the group while a process of the group lives.
 *
 * The module also records each live child. When the host process ends (a normal exit, or
 * SIGINT, SIGTERM or SIGHUP), it kills each recorded tree, so no child keeps running alone.
 *
 * A signal kills the trees only when no other handler owns the signal. A host under `run()` of
 * `@mark1russell7/service` owns its signals: the drain aborts each call, and the abort of a
 * procedure kills its tree, so its stream ends in band. The exit hook then kills each tree that
 * still runs at the exit.
 */

import { execFile, spawnSync, type ChildProcess } from "node:child_process";
import { systemProgram } from "./program.js";

const WINDOWS = process.platform === "win32";

/**
 * The full path of `taskkill.exe` in the system folder. A bare name started a `taskkill.exe` of
 * the working folder of the host first.
 */
const TASKKILL = WINDOWS ? systemProgram("taskkill.exe") : "taskkill";

/**
 * True when a child must start with `detached: true`. On POSIX, `detached` puts the child in a
 * new process group, which `killTree` needs. On Windows, `detached` opens a new console.
 */
export const OWN_PROCESS_GROUP: boolean = !WINDOWS;

function running(child: ChildProcess): boolean {
  return child.pid !== undefined && child.exitCode === null && child.signalCode === null;
}

/**
 * True when a process of the group of `pid` lives. The id of a group stays reserved while a
 * process of the group lives, so a signal to the group then reaches only that group.
 */
function groupLives(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * This function signals the group of a child that ended, while a process of the group lives. It
 * does nothing on Windows, where the tree of an ended process is not known.
 */
function signalOrphans(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid;
  if (WINDOWS || pid === undefined || !groupLives(pid)) return;
  try {
    process.kill(-pid, signal);
  } catch {
    // The group ended in the meantime
  }
}

/**
 * This function kills the process tree of `child`. When the child ended and a descendant keeps
 * its process group (POSIX), the function signals that group.
 */
export function killTree(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): void {
  if (!running(child)) {
    signalOrphans(child, signal);
    return;
  }
  const pid = child.pid!;
  if (WINDOWS) {
    execFile(TASKKILL, ["/T", "/F", "/PID", String(pid)], { windowsHide: true }, (error) => {
      // taskkill fails when the process ended in the meantime, or when taskkill is missing
      if (error && running(child)) child.kill(signal);
    });
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    // The child is not a group leader (it did not start detached): kill only the child
    child.kill(signal);
  }
}

/** The synchronous form, for the exit of the host, when callbacks do not run any more. */
function killTreeSync(child: ChildProcess): void {
  if (!running(child)) {
    signalOrphans(child, "SIGKILL");
    return;
  }
  const pid = child.pid!;
  try {
    if (WINDOWS) {
      spawnSync(TASKKILL, ["/T", "/F", "/PID", String(pid)], { windowsHide: true, stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      // The process ended
    }
  }
}

// =============================================================================
// The live children, and the hooks that kill them when the host ends
// =============================================================================

const live = new Set<ChildProcess>();
const SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
let hooked = false;

function killAll(): void {
  for (const child of live) killTreeSync(child);
  live.clear();
}

function onExit(): void {
  killAll();
}

/**
 * The handler of SIGINT, SIGTERM and SIGHUP. Another handler of the signal (the runner of the
 * service, or the interrupt of `mark`) owns the stop: this handler then does nothing. Before, it
 * killed each tree at the signal, before the drain, so a stream ended with `done` and not in band.
 */
export function onSignal(signal: NodeJS.Signals): void {
  if (process.listenerCount(signal) > 1) return;
  // Without this handler, Node ends the process on the signal. As the only handler, do the same:
  // kill the trees, remove the hooks and send the signal again.
  killAll();
  unhook();
  process.kill(process.pid, signal);
}

function hook(): void {
  if (hooked) return;
  hooked = true;
  process.on("exit", onExit);
  for (const signal of SIGNALS) process.on(signal, onSignal);
}

function unhook(): void {
  if (!hooked) return;
  hooked = false;
  process.off("exit", onExit);
  for (const signal of SIGNALS) process.off(signal, onSignal);
}

/**
 * This function records a child until it and its output pipes end (`close`). A descendant can
 * keep the pipes after the end of the child. While at least one child is recorded, the hooks
 * kill the recorded trees when the host ends. With no recorded child, the host has no hooks.
 */
export function track(child: ChildProcess): void {
  if (!running(child)) return;
  live.add(child);
  hook();
  const forget = (): void => {
    live.delete(child);
    if (live.size === 0) unhook();
  };
  child.once("close", forget);
}
