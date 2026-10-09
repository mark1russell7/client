/**
 * node.kill procedure
 *
 * Kills a spawned Node.js process and the processes that it started.
 */

import type { NodeKillInput, NodeKillOutput } from "../../types.js";
import { processManager } from "../../process-manager.js";

/**
 * Kill a spawned process by ID, and wait for its end
 */
export async function nodeKill(input: NodeKillInput): Promise<NodeKillOutput> {
  const { processId, signal = "SIGTERM" } = input;

  if (!processManager.get(processId)) {
    return {
      success: false,
    };
  }

  const success = await processManager.kill(processId, signal as NodeJS.Signals);
  const processInfo = processManager.getStatus(processId)[0];

  const result: NodeKillOutput = { success };
  if (processInfo?.exitCode !== undefined) {
    result.exitCode = processInfo.exitCode;
  }
  return result;
}
