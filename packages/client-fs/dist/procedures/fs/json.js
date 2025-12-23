/**
 * read.json procedure
 *
 * Read and parse JSON file
 */
import { read } from "./read.js";
/**
 * Read and parse JSON file
 */
export async function readJson(input) {
    const { path } = input;
    const { content, stats } = await read({ path, encoding: 'utf8' });
    const data = JSON.parse(content);
    return { path, data, stats };
}
//# sourceMappingURL=json.js.map