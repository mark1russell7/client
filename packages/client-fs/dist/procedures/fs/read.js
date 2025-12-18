/**
 * read procedure
 *
 * Read file contents
 */
import { readFile, stat } from "node:fs/promises";
/**
 * Read file contents
 */
export async function read(input) {
    const { path, encoding } = input;
    const content = await readFile(path, { encoding: encoding });
    const stats = await stat(path);
    return {
        content,
        path,
        size: stats.size,
    };
}
//# sourceMappingURL=read.js.map