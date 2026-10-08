/**
 * connection.get procedure
 *
 * Get specific connection info
 */

import { getConnectionManager } from "../../manager.js";
import type { GetInput, GetOutput } from "../../types.js";

/**
 * Get specific connection info
 */
export async function get(input: GetInput): Promise<GetOutput> {
  const manager = getConnectionManager();
  const connection = manager.getConnectionInfo(input.clientId);
  return { connection };
}
