/**
 * read procedure
 *
 * Read file contents
 */
import { readFile } from "node:fs/promises";
import { stat } from "./stat.js";
/**
 * Read file contents
 */
export async function read(input) {
    const { path, encoding } = input;
    const content = await readFile(path, { encoding: encoding });
    const stats = await stat({ path });
    return {
        content,
        path,
        stats
    };
}
//# sourceMappingURL=read.js.map