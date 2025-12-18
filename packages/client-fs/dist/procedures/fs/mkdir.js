/**
 * mkdir procedure
 *
 * Create directory
 */
import { mkdir as fsMkdir, stat } from "node:fs/promises";
/**
 * Create directory
 */
export async function mkdir(input) {
    const { path, recursive } = input;
    try {
        await stat(path);
        return { path, created: false };
    }
    catch {
        await fsMkdir(path, { recursive });
        return { path, created: true };
    }
}
//# sourceMappingURL=mkdir.js.map