/**
 * node.status procedure
 *
 * Gets status of spawned Node.js processes.
 */

import type { NodeStatusInput, NodeStatusOutput } from "../../types.js";
import { processManager } from "../../process-manager.js";

/**
 * Get status of running processes (and the recent exits)
 */
export async function nodeStatus(input: NodeStatusInput): Promise<NodeStatusOutput> {
  const { processId } = input;

  const processes = processManager.getStatus(processId).map((info) =>
    input.output ? { ...info, output: processManager.output(info.processId) } : info
  );

  return {
    processes,
  };
}
