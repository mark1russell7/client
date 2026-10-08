/**
 * node.status procedure
 *
 * Gets status of spawned Node.js processes.
 */

import type { NodeStatusInput, NodeStatusOutput } from "../../types.js";
import { processManager } from "../../process-manager.js";

/**
 * Get status of running processes
 */
export async function nodeStatus(input: NodeStatusInput): Promise<NodeStatusOutput> {
  const { processId } = input;

  const processes = processManager.getStatus(processId);

  return {
    processes,
  };
}
