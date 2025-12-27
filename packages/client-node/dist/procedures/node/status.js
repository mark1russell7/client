/**
 * node.status procedure
 *
 * Gets status of spawned Node.js processes.
 */
import { processManager } from "../../process-manager.js";
/**
 * Get status of running processes
 */
export async function nodeStatus(input) {
    const { processId } = input;
    const processes = processManager.getStatus(processId);
    return {
        processes,
    };
}
//# sourceMappingURL=status.js.map