/**
 * exists procedure
 *
 * Check if file or directory exists
 */
import { stat } from "node:fs/promises";
/**
 * Check if file or directory exists
 */
export async function exists(input) {
    const { path } = input;
    try {
        const stats = await stat(path);
        let type = "other";
        if (stats.isFile())
            type = "file";
        else if (stats.isDirectory())
            type = "directory";
        return { exists: true, path, type };
    }
    catch {
        return { exists: false, path };
    }
}
//# sourceMappingURL=exists.js.map