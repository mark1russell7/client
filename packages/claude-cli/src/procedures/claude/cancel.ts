/**
 * claude.cancel procedure
 *
 * This procedure stops a turn and the processes that it started, by the process id of the turn.
 * It also stops a turn that a previous host started.
 */

import { cancelTurn } from "../../turn.js";
import type { ClaudeCancelInput, ClaudeCancelOutput } from "../../types.js";

/**
 * This function stops the process tree of the turn. It gives `stopped: false` and a reason when
 * the process has ended.
 */
export async function claudeCancel(input: ClaudeCancelInput): Promise<ClaudeCancelOutput> {
  return cancelTurn(input.pid);
}
