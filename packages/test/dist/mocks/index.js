/**
 * Mock utilities for testing procedures
 *
 * Provides mock factories for Client, ProcedureContext, and other core types.
 */
/**
 * Create a mock ProcedureContext
 */
export function createMockContext(options = {}) {
    // Dynamic import of vitest to get mock function
    const { vi } = require("vitest");
    return {
        cwd: options.cwd ?? process.cwd(),
        log: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        },
        client: {
            call: vi.fn(),
            exec: vi.fn(),
        },
    };
}
export function createMockExec(results) {
    const { vi } = require("vitest");
    return vi.fn().mockImplementation((cmd) => {
        const result = results.get(cmd);
        if (!result) {
            throw new Error(`No mock result for command: ${cmd}`);
        }
        if (result.exitCode !== 0) {
            const error = new Error(`Command failed: ${cmd}`);
            error.stdout = result.stdout;
            error.stderr = result.stderr;
            throw error;
        }
        return { stdout: result.stdout, stderr: result.stderr };
    });
}
export function createMockFs(initialFiles = {}, initialDirs = []) {
    const { vi } = require("vitest");
    const files = new Map(Object.entries(initialFiles));
    const dirs = new Set(initialDirs);
    return {
        files,
        dirs,
        readFile: vi.fn().mockImplementation((path) => {
            const content = files.get(path);
            if (content === undefined) {
                throw new Error(`ENOENT: no such file: ${path}`);
            }
            return content;
        }),
        writeFile: vi.fn().mockImplementation((path, content) => {
            files.set(path, content);
        }),
        mkdir: vi.fn().mockImplementation((path) => {
            dirs.add(path);
        }),
        readdir: vi.fn().mockImplementation((path) => {
            const entries = [];
            for (const file of files.keys()) {
                if (file.startsWith(path + "/")) {
                    const rest = file.slice(path.length + 1);
                    const name = rest.split("/")[0];
                    if (name && !entries.includes(name)) {
                        entries.push(name);
                    }
                }
            }
            return entries;
        }),
        stat: vi.fn().mockImplementation((path) => {
            if (dirs.has(path)) {
                return { isDirectory: () => true, isFile: () => false };
            }
            if (files.has(path)) {
                return { isDirectory: () => false, isFile: () => true };
            }
            throw new Error(`ENOENT: no such file or directory: ${path}`);
        }),
        exists: vi.fn().mockImplementation((path) => {
            return files.has(path) || dirs.has(path);
        }),
    };
}
//# sourceMappingURL=index.js.map