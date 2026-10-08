/**
 * server.mongo.status procedure - Get MongoDB server status
 */

import type { ServerMongoStatusInput, ServerMongoStatusOutput } from "../../types.js";
import { mongoServerManager } from "../../server-manager.js";

export async function serverMongoStatus(input: ServerMongoStatusInput): Promise<ServerMongoStatusOutput> {
  const { serverId } = input;
  const servers = mongoServerManager.getStatus(serverId);
  return { servers };
}
