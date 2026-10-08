/**
 * connection.broadcast procedure
 *
 * Call procedure on all connected clients
 */

import { getConnectionManager } from "../../manager.js";
import type { BroadcastInput, BroadcastOutput } from "../../types.js";

/**
 * Call procedure on all connected clients
 */
export async function broadcast(input: BroadcastInput): Promise<BroadcastOutput> {
  const manager = getConnectionManager();
  const options: { waitForResponses?: boolean; timeout?: number } = {};
  if (input.waitForResponses !== undefined) {
    options.waitForResponses = input.waitForResponses;
  }
  if (input.timeout !== undefined) {
    options.timeout = input.timeout;
  }
  const result = await manager.broadcast(input.path, input.input, options);
  return result;
}
