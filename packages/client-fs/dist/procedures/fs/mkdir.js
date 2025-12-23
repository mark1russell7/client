/**
 * mkdir procedure
 *
 * Create directory
 */
import { mkdir as fsMkdir } from "node:fs/promises";
import { stat } from "./stat.js";
/**
 * Create directory
 */
export async function mkdir(input) {
    const { path, recursive } = input;
    try {
        await stat(input);
        return { path, created: false };
    }
    catch {
        await fsMkdir(path, { recursive });
        return { path, created: true };
    }
}
//# sourceMappingURL=mkdir.js.map