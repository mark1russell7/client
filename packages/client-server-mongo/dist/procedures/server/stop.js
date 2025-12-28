/**
 * server.mongo.stop procedure - Stop MongoDB peer server
 */
import { mongoServerManager } from "../../server-manager.js";
export async function serverMongoStop(input) {
    const { serverId } = input;
    const success = await mongoServerManager.stop(serverId);
    return { success };
}
//# sourceMappingURL=stop.js.map