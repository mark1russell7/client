/**
 * mkdir procedure
 *
 * Create directory
 */
import { mkdir as fsMkdir } from "node:fs/promises";
import { FileType } from "../../types.js";
import { stat } from "./stat.js";
/**
 * Create directory
 */
export async function mkdir(input) {
    const { path, recursive } = input;
    // Probe the existing path. Only a genuine "not found" (ENOENT) means we
    // should proceed to create it; any other stat error (e.g. EACCES) must
    // propagate rather than being masked by an mkdir attempt.
    let existing;
    try {
        existing = await stat(input);
    }
    catch (err) {
        if (err.code !== "ENOENT")
            throw err;
    }
    if (existing) {
        // The path already exists. It's only a no-op success if it's a directory;
        // an existing file (or other non-directory) is a real conflict, not a
        // silently-"already created" directory.
        if (existing.type === FileType.Directory) {
            return { path, created: false };
        }
        const conflict = new Error(`Cannot create directory: path already exists and is not a directory: ${path}`);
        conflict.code = "EEXIST";
        throw conflict;
    }
    await fsMkdir(path, { recursive });
    return { path, created: true };
}
//# sourceMappingURL=mkdir.js.map