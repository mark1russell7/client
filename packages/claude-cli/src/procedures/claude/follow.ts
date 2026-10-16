/**
 * claude.follow procedure
 *
 * This procedure follows the output file of a turn and streams its events until the turn ends.
 * When the caller stops reading, or its signal aborts, the follow stops. The turn continues.
 */

import { followTurn } from "../../turn.js";
import type { ClaudeFollowInput, ClaudeFollowOutput } from "../../types.js";

/**
 * This function gives each event of the turn. It stops after the result, or after an error event
 * when the process ends without a result.
 */
export async function* claudeFollow(
  input: ClaudeFollowInput,
  ctx?: { signal?: AbortSignal | undefined }
): AsyncGenerator<ClaudeFollowOutput, void, undefined> {
  yield* followTurn({
    outputFile: input.outputFile,
    offset: input.offset,
    pid: input.pid,
    pollMs: input.pollMs,
    signal: ctx?.signal,
  });
}
