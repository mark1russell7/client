/**
 * connection.subscribe procedure
 *
 * Subscribe to a topic
 */

import { getConnectionManager } from "../../manager.js";
import type { SubscribeInput, SubscribeOutput } from "../../types.js";

/**
 * Subscribe to a topic
 */
export async function subscribe(input: SubscribeInput): Promise<SubscribeOutput> {
  const manager = getConnectionManager();

  // In a real scenario, clientId would come from the request context
  // For now, it must be provided in the input
  if (!input.clientId) {
    throw new Error("clientId is required");
  }

  const subscriptionId = manager.subscribe(input.clientId, input.topic);
  return {
    subscriptionId,
    topic: input.topic,
  };
}
