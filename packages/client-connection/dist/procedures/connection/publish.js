/**
 * connection.publish procedure
 *
 * Publish data to topic subscribers
 */
import { getConnectionManager } from "../../manager.js";
/**
 * Publish data to topic subscribers
 */
export async function publish(input) {
    const manager = getConnectionManager();
    const delivered = await manager.publish(input.topic, input.data);
    return {
        delivered,
        topic: input.topic,
    };
}
//# sourceMappingURL=publish.js.map