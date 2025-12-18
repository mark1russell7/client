/**
 * connection.unsubscribe procedure
 *
 * Unsubscribe from a topic
 */

import { getConnectionManager } from "../../manager.js";
import type { UnsubscribeInput, UnsubscribeOutput } from "../../types.js";

/**
 * Unsubscribe from a topic
 */
export async function unsubscribe(input: UnsubscribeInput): Promise<UnsubscribeOutput> {
  const manager = getConnectionManager();
  const success = manager.unsubscribe(input.subscriptionId);
  return {
    success,
    subscriptionId: input.subscriptionId,
  };
}
