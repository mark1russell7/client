/**
 * node.spawn procedure
 *
 * Spawns a long-running Node.js process.
 *
 * The process is a record of the process registry of client-shell: node.status shows it,
 * node.kill ends its whole tree, and it ends with the host (deep dive WRP-4, WRP-10).
 */

import type { NodeSpawnInput, NodeSpawnOutput } from "../../types.js";
import { processManager } from "../../process-manager.js";

/**
 * Spawn a long-running Node.js process
 */
export async function nodeSpawn(input: NodeSpawnInput): Promise<NodeSpawnOutput> {
  const { script, args = [], cwd, env, ready } = input;

  const started = processManager.start(script, { args, cwd, env });
  if (started.status === "error") {
    throw new Error(`node did not start for ${script}`);
  }

  // Wait for ready pattern if specified
  if (ready) {
    try {
      await processManager.waitForReady(started.processId, ready.pattern, ready.timeout ?? 30000);
    } catch (error) {
      // A process that is not ready is of no use to the caller: stop it
      await processManager.kill(started.processId);
      throw error;
    }
  }

  return {
    processId: started.processId,
    pid: started.pid,
  };
}
