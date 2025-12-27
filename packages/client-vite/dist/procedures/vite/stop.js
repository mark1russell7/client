/**
 * vite.stop procedure - Stop a running server
 */
import { serverManager } from "../../server-manager.js";
export async function viteStop(input) {
    const { serverId } = input;
    const success = serverManager.stop(serverId);
    return { success };
}
//# sourceMappingURL=stop.js.map