/**
 * node.spawn procedure
 *
 * Spawns a long-running Node.js process.
 */

import { spawn } from "child_process";
import type { NodeSpawnInput, NodeSpawnOutput } from "../../types.js";
import { processManager } from "../../process-manager.js";

/**
 * Spawn a long-running Node.js process
 */
export async function nodeSpawn(input: NodeSpawnInput): Promise<NodeSpawnOutput> {
  const { script, args = [], cwd, env, ready } = input;

  const child = spawn("node", [script, ...args], {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Prevent parent from waiting for child
  child.unref();

  const processId = processManager.register(child, script);

  // Wait for ready pattern if specified
  if (ready) {
    await processManager.waitForReady(
      processId,
      ready.pattern,
      ready.timeout ?? 30000
    );
  }

  return {
    processId,
    pid: child.pid ?? 0,
  };
}
