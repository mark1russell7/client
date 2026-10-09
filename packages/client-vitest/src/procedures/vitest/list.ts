/**
 * vitest.list procedure
 *
 * List the vitest watch processes
 */

import { processes } from "@mark1russell7/client-shell/command";
import type { VitestListInput, VitestListOutput, VitestProcessInfo } from "../../types.js";
import { VITEST_GROUP } from "./watch.js";

/**
 * List the vitest watch processes of this host: the running ones and the recent exits
 */
export async function vitestList(
  input: VitestListInput,
  _ctx: { metadata: Record<string, unknown> }
): Promise<VitestListOutput> {
  return {
    processes: processes.list({ group: VITEST_GROUP }).map((info) => {
      const entry: VitestProcessInfo = {
        id: info.id,
        pid: info.pid,
        status: info.status,
        startedAt: info.startedAt,
      };
      if (info.cwd !== undefined) entry.cwd = info.cwd;
      if (info.exitedAt !== undefined) entry.exitedAt = info.exitedAt;
      if (info.exitCode !== undefined) entry.exitCode = info.exitCode;
      if (input.output) entry.output = processes.output(info.id);
      return entry;
    }),
  };
}
