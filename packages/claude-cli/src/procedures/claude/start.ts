/**
 * claude.start procedure
 *
 * This procedure starts one turn of the Claude Code CLI as a detached process that writes to a
 * file. The turn continues when the host stops.
 */

import { startTurn, type Spawner } from "../../turn.js";
import type { ClaudeStartInput, ClaudeStartOutput } from "../../types.js";

/**
 * This function starts a turn. The variables of `input.env` go on top of the environment of the
 * host. It gives the process id and the output file of the turn.
 */
export async function claudeStart(input: ClaudeStartInput, spawner?: Spawner): Promise<ClaudeStartOutput> {
  const turn = await startTurn({
    prompt: input.prompt,
    cwd: input.cwd,
    args: input.args,
    outputFile: input.outputFile,
    promptFile: input.promptFile,
    executable: input.executable,
    executableArgs: input.executableArgs,
    env: input.env !== undefined ? { ...process.env, ...input.env } : undefined,
    spawner,
  });
  return { ...turn, args: [...turn.args] };
}
