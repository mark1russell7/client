/**
 * exists procedure
 *
 * Check if file or directory exists
 */
import {} from "../../types.js";
import { stat } from "./stat.js";
/**
 * Check if file or directory exists
 */
export async function exists(input) {
    try {
        const stats = await stat(input);
        return { exists: true, stats };
    }
    catch {
        return { exists: false };
    }
}
//# sourceMappingURL=exists.js.map