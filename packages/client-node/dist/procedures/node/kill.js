/**
 * node.kill procedure
 *
 * Kills a spawned Node.js process.
 */
import { processManager } from "../../process-manager.js";
/**
 * Kill a spawned process by ID
 */
export async function nodeKill(input) {
    const { processId, signal = "SIGTERM" } = input;
    const managed = processManager.get(processId);
    if (!managed) {
        return {
            success: false,
        };
    }
    const success = processManager.kill(processId, signal);
    // Wait a bit for the process to exit
    await new Promise((resolve) => setTimeout(resolve, 100));
    const status = processManager.getStatus(processId);
    const processInfo = status[0];
    const result = { success };
    if (processInfo?.exitCode !== undefined) {
        result.exitCode = processInfo.exitCode;
    }
    return result;
}
//# sourceMappingURL=kill.js.map