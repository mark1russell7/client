/**
 * claude.read procedure
 *
 * This procedure reads the new events of a turn from its output file, from a byte offset.
 */

import { readTurn } from "../../turn.js";
import type { ClaudeReadInput, ClaudeReadOutput } from "../../types.js";

/**
 * This function reads the complete lines after `input.offset` and gives their events and the
 * offset for the next read.
 */
export async function claudeRead(input: ClaudeReadInput): Promise<ClaudeReadOutput> {
  return readTurn({ outputFile: input.outputFile, offset: input.offset, pid: input.pid });
}
