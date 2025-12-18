/**
 * connection.call procedure
 *
 * Call procedure on specific client
 */
import { getConnectionManager } from "../../manager.js";
/**
 * Call procedure on specific client
 */
export async function call(input) {
    const manager = getConnectionManager();
    const result = await manager.callClient(input.clientId, input.path, input.input, input.timeout);
    return { result, clientId: input.clientId };
}
//# sourceMappingURL=call.js.map