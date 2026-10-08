/**
 * @mark1russell7/mock-fs
 */
function normalizePath(p) { let r = p.split("\\").join("/"); while (r.endsWith("/"))
    r = r.slice(0, -1); return r; }
export function createMockFs(options = {}) {
    const files = new Map();
    if (options.initialDirs) {
        for (const dir of options.initialDirs) {
            files.set(normalizePath(dir), { type: "directory", mtime: new Date() });
        }
    }
    if (options.initialFiles) {
        for (const [fp, content] of Object.entries(options.initialFiles)) {
            files.set(normalizePath(fp), { type: "file", content, mtime: new Date() });
        }
    }
    const ensureParent = (fp) => {
        const parts = normalizePath(fp).split("/").slice(0, -1);
        let cur = "";
        for (const part of parts) {
            cur = cur ? cur + "/" + part : part;
            if (cur && !files.has(cur))
                files.set(cur, { type: "directory", mtime: new Date() });
        }
    };
    return {
        files,
        readFile(p) {
            const e = files.get(normalizePath(p));
            if (!e || e.type !== "file")
                throw new Error("ENOENT: " + p);
            return e.content ?? "";
        },
        writeFile(p, content) {
            const np = normalizePath(p);
            ensureParent(np);
            files.set(np, { type: "file", content, mtime: new Date() });
        },
        exists(p) { return files.has(normalizePath(p)); },
        unlink(p) {
            const np = normalizePath(p);
            if (!files.has(np))
                throw new Error("ENOENT: " + p);
            files.delete(np);
        },
        mkdir(p, opts) {
            const np = normalizePath(p);
            if (opts?.recursive)
                ensureParent(np + "/x");
            files.set(np, { type: "directory", mtime: new Date() });
        },
        readdir(p) {
            const np = normalizePath(p);
            const prefix = np === "" ? "" : np + "/";
            const entries = new Set();
            for (const key of files.keys()) {
                if (key.startsWith(prefix) && key !== np) {
                    const rest = key.slice(prefix.length);
                    const name = rest.split("/")[0];
                    if (name)
                        entries.add(name);
                }
            }
            return [...entries];
        },
        reset() { files.clear(); },
    };
}
//# sourceMappingURL=index.js.map