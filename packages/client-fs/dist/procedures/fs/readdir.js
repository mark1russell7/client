/**
 * readdir procedure
 *
 * Read directory contents
 */
import { readdir as fsReaddir } from "node:fs/promises";
import { join } from "node:path";
import { FileType } from "../../types.js";
import { stat } from "./stat.js";
/**
 * Read directory contents
 */
export async function readdir(input) {
    const { path, recursive, includeStats } = input;
    const entries = [];
    async function readDir(dir) {
        const items = await fsReaddir(dir, { withFileTypes: true });
        for (const item of items) {
            const fullPath = join(dir, item.name);
            let type = FileType.Other;
            if (item.isFile())
                type = FileType.File;
            else if (item.isDirectory())
                type = FileType.Directory;
            const entry = { name: item.name, path: fullPath, type };
            if (includeStats) {
                entry.stats = await stat({ path: fullPath });
            }
            entries.push(entry);
            if (recursive && item.isDirectory()) {
                await readDir(fullPath);
            }
        }
    }
    await readDir(path);
    return { path, entries };
}
//# sourceMappingURL=readdir.js.map