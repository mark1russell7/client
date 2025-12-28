/**
 * server.mongo.stop procedure - Stop MongoDB peer server
 */

import type { ServerMongoStopInput, ServerMongoStopOutput } from "../../types.js";
import { mongoServerManager } from "../../server-manager.js";

export async function serverMongoStop(input: ServerMongoStopInput): Promise<ServerMongoStopOutput> {
  const { serverId } = input;
  const success = await mongoServerManager.stop(serverId);
  return { success };
}
