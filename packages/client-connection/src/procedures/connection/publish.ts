/**
 * connection.publish procedure
 *
 * Publish data to topic subscribers
 */

import { getConnectionManager } from "../../manager.js";
import type { PublishInput, PublishOutput } from "../../types.js";

/**
 * Publish data to topic subscribers
 */
export async function publish(input: PublishInput): Promise<PublishOutput> {
  const manager = getConnectionManager();
  const delivered = await manager.publish(input.topic, input.data);
  return {
    delivered,
    topic: input.topic,
  };
}
