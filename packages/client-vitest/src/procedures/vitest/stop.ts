/**
 * vitest.stop procedure
 *
 * Stop a vitest watch process
 */

import { processes } from "@mark1russell7/client-shell/command";
import type { VitestStopInput, VitestStopOutput } from "../../types.js";
import { VITEST_GROUP } from "./watch.js";

/**
 * Stop a vitest watch process (the whole process tree), or every one when no id is given
 */
export async function vitestStop(
  input: VitestStopInput,
  _ctx: { metadata: Record<string, unknown> }
): Promise<VitestStopOutput> {
  const running = processes
    .list({ group: VITEST_GROUP })
    .filter((info) => info.status === "running" && (input.id === undefined || info.id === input.id));
  if (input.id !== undefined && running.length === 0) {
    return { success: false, stopped: [] };
  }
  const stopped: string[] = [];
  for (const info of running) {
    if ((await processes.stop(info.id)).stopped) stopped.push(info.id);
  }
  return { success: true, stopped };
}
