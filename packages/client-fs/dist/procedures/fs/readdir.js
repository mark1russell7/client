/**
 * readdir procedure
 *
 * Read directory contents
 */
import { readdir as fsReaddir, stat } from "node:fs/promises";
import { join } from "node:path";
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
            let type = "other";
            if (item.isFile())
                type = "file";
            else if (item.isDirectory())
                type = "directory";
            const entry = { name: item.name, path: fullPath, type };
            if (includeStats) {
                const stats = await stat(fullPath);
                entry.stats = {
                    size: stats.size,
                    mtime: stats.mtime.toISOString(),
                    ctime: stats.ctime.toISOString(),
                };
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