/**
 * connection.get procedure
 *
 * Get specific connection info
 */
import { getConnectionManager } from "../../manager.js";
/**
 * Get specific connection info
 */
export async function get(input) {
    const manager = getConnectionManager();
    const connection = manager.getConnectionInfo(input.clientId);
    return { connection };
}
//# sourceMappingURL=get.js.map