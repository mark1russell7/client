/**
 * Procedure: server.stop
 * Stops the running CLI server daemon
 */

import { createProcedure, type Procedure } from "@mark1russell7/client";
import { schema } from "../schema.js";
import { serverStopInputSchema } from "../input-schemas.js";
import { checkServer, readAllLockfiles, readLockfileForPort, removeLockfileForPort, type LockfileData } from "../lockfile.js";
import type { ServerStopInput, ServerStopOutput } from "../types.js";


const serverStopOutputSchema = schema<ServerStopOutput>();





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
    args: [],
    shorts: { port: "p" },
  })
  .handler(async (input: ServerStopInput): Promise<ServerStopOutput> => {
    const force = input.force ?? false;
    const signal: NodeJS.Signals = force ? "SIGKILL" : "SIGTERM";

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
        success: false,
        message: input.port
          ? `No server found on port ${input.port}`
          : "No servers running",
      };
    }

    const results: string[] = [];
    let allSuccess = true;

    for (const lockfile of targets) {
      const { pid, port } = lockfile;

      // Signal the PID only when the server answers as the peer of this lockfile: Windows reuses
      // PIDs, and before, a stale lockfile made this kill an unrelated process (deep dive CLI-4)
      const state = await checkServer(lockfile);
      if (state !== "alive") {
        removeLockfileForPort(port);
        results.push(
          state === "dead"
            ? `Port ${port}: cleaned up stale lockfile`
            : `Port ${port}: another process answers on this port; nothing stopped (stale lockfile removed)`
        );
        continue;
      }

      const sent = killProcess(pid, signal);
      if (!sent) {
        allSuccess = false;
        results.push(`Port ${port}: failed to send ${signal} to PID ${pid}`);
        continue;
      }

      // Wait for process to die
      const maxWait = force ? 500 : 5000;
      const startTime = Date.now();
      let stopped = false;

      while (Date.now() - startTime < maxWait) {
        if ((await checkServer(lockfile, 300)) === "dead") {
          removeLockfileForPort(port);
          results.push(`Port ${port}: stopped (PID ${pid})`);
          stopped = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!stopped) {
        allSuccess = false;
        results.push(`Port ${port}: PID ${pid} did not stop${force ? "" : " (try --force)"}`);
      }
    }

    return {
      success: allSuccess,
      message: results.join("\n"),
    };
  })
  .build();

export type { ServerStopInput, ServerStopOutput };
