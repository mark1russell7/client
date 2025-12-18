/**
 * connection.list procedure
 *
 * List all connected clients
 */
import { getConnectionManager } from "../../manager.js";
/**
 * List all connected clients
 */
export async function list(_input) {
    const manager = getConnectionManager();
    const connections = manager.getAllConnectionInfo();
    return { connections };
}
//# sourceMappingURL=list.js.map