/**
 * read.json procedure
 *
 * Read and parse JSON file
 */
import { readFile } from "node:fs/promises";
/**
 * Read and parse JSON file
 */
export async function readJson(input) {
    const { path } = input;
    const content = await readFile(path, { encoding: "utf8" });
    const data = JSON.parse(content);
    return { path, data };
}
//# sourceMappingURL=json.js.map