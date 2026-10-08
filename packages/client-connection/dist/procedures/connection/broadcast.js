/**
 * connection.broadcast procedure
 *
 * Call procedure on all connected clients
 */
import { getConnectionManager } from "../../manager.js";
/**
 * Call procedure on all connected clients
 */
export async function broadcast(input) {
    const manager = getConnectionManager();
    const options = {};
    if (input.waitForResponses !== undefined) {
        options.waitForResponses = input.waitForResponses;
    }
    if (input.timeout !== undefined) {
        options.timeout = input.timeout;
    }
    const result = await manager.broadcast(input.path, input.input, options);
    return result;
}
//# sourceMappingURL=broadcast.js.map