/**
 * connection.call procedure
 *
 * Call procedure on specific client
 */

import { getConnectionManager } from "../../manager.js";
import type { CallInput, CallOutput } from "../../types.js";

/**
 * Call procedure on specific client
 */
export async function call(input: CallInput): Promise<CallOutput> {
  const manager = getConnectionManager();
  const result = await manager.callClient(
    input.clientId,
    input.path,
    input.input,
    input.timeout
  );
  return { result, clientId: input.clientId };
}
