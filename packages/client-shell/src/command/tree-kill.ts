/**
 * Kill a child process and all the processes that it started (deep dive WRP-10).
 *
 * `child.kill()` reaches only the direct child. On Windows it calls `TerminateProcess`, so the
 * grandchildren keep running (a `pnpm` that starts `node`, a `vite` that starts `esbuild`).
 * - On Windows, `taskkill /T /F` ends the tree of the process id.
 * - Elsewhere, the child starts in its own process group (`detached`), and a signal to the
 *   negative pid reaches every process of the group.
 *
 * The module also records each live child. When the host process ends (a normal exit, or
 * SIGINT, SIGTERM or SIGHUP), it kills each recorded tree, so no child keeps running alone.
 */

import { execFile, spawnSync, type ChildProcess } from "node:child_process";

const WINDOWS = process.platform === "win32";

/**
 * True when a child must start with `detached: true`. On POSIX, `detached` puts the child in a
 * new process group, which `killTree` needs. On Windows, `detached` opens a new console.
 */
export const OWN_PROCESS_GROUP: boolean = !WINDOWS;

function running(child: ChildProcess): boolean {
  return child.pid !== undefined && child.exitCode === null && child.signalCode === null;
}

/** This function kills the process tree of `child`. It does nothing when the child has ended. */
export function killTree(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): void {
  if (!running(child)) return;
  const pid = child.pid!;
  if (WINDOWS) {
    execFile("taskkill", ["/T", "/F", "/PID", String(pid)], { windowsHide: true }, (error) => {
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
  if (!running(child)) return;
  const pid = child.pid!;
  try {
    if (WINDOWS) {
      spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { windowsHide: true, stdio: "ignore" });
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

function onSignal(signal: NodeJS.Signals): void {
  killAll();
  // Without this handler, Node ends the process on the signal. When this handler is the only one,
  // do the same: remove the hooks and send the signal again.
  if (process.listenerCount(signal) === 1) {
    unhook();
    process.kill(process.pid, signal);
  }
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
 * This function records a child until it ends. While at least one child is recorded, the hooks
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
  child.once("exit", forget);
  child.once("error", forget);
}
