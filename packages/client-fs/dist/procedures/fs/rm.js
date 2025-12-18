/**
 * rm procedure
 *
 * Remove file or directory
 */
import { rm as fsRm, stat } from "node:fs/promises";
/**
 * Remove file or directory
 */
export async function rm(input) {
    const { path, recursive, force } = input;
    try {
        await stat(path);
        await fsRm(path, { recursive, force });
        return { path, removed: true };
    }
    catch (err) {
        if (force) {
            return { path, removed: false };
        }
        throw err;
    }
}
//# sourceMappingURL=rm.js.map