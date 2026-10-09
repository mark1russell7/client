/**
 * vitest.watch procedure
 *
 * Start vitest in watch mode, as a process of the process registry of client-shell. vitest.list
 * shows it and vitest.stop ends it, and it ends with the host (deep dive WRP-4). Before, the
 * process started detached and the procedure forgot it: nothing could stop it.
 */

import { processes } from "@mark1russell7/client-shell/command";
import type { VitestWatchInput, VitestWatchOutput } from "../../types.js";
import { resolveVitestCli } from "../../vitest-cli.js";

/** The group of the vitest processes in the process registry. */
export const VITEST_GROUP = "vitest";

export async function vitestWatch(
  input: VitestWatchInput,
  _ctx: { metadata: Record<string, unknown> }
): Promise<VitestWatchOutput> {
  const cwd = input.cwd ?? process.cwd();
  const args = [resolveVitestCli(cwd), "watch"];

  for (const pattern of input.include ?? []) {
    if (pattern.startsWith("-")) {
      throw new Error(`Invalid test pattern (starts with "-"): ${pattern}`);
    }
    args.push(pattern);
  }

  // No shell: test patterns cannot inject commands
  const started = processes.start(process.execPath, {
    args,
    cwd,
    group: VITEST_GROUP,
    label: `vitest watch ${cwd}`,
  });
  if (started.status === "error") {
    throw new Error(`vitest did not start: ${started.error ?? "unknown error"}`);
  }

  return {
    id: started.id,
    pid: started.pid,
    status: "started",
  };
}
