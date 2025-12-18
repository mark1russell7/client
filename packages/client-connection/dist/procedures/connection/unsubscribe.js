/**
 * connection.unsubscribe procedure
 *
 * Unsubscribe from a topic
 */
import { getConnectionManager } from "../../manager.js";
/**
 * Unsubscribe from a topic
 */
export async function unsubscribe(input) {
    const manager = getConnectionManager();
    const success = manager.unsubscribe(input.subscriptionId);
    return {
        success,
        subscriptionId: input.subscriptionId,
    };
}
//# sourceMappingURL=unsubscribe.js.map