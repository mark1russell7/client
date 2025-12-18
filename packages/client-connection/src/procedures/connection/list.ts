/**
 * connection.list procedure
 *
 * List all connected clients
 */

import { getConnectionManager } from "../../manager.js";
import type { ListInput, ListOutput } from "../../types.js";

/**
 * List all connected clients
 */
export async function list(_input: ListInput): Promise<ListOutput> {
  const manager = getConnectionManager();
  const connections = manager.getAllConnectionInfo();
  return { connections };
}
