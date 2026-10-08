/**
 * server.mongo.status procedure - Get MongoDB server status
 */
import { mongoServerManager } from "../../server-manager.js";
export async function serverMongoStatus(input) {
    const { serverId } = input;
    const servers = mongoServerManager.getStatus(serverId);
    return { servers };
}
//# sourceMappingURL=status.js.map