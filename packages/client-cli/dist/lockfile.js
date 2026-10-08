/**
 * Lockfile Utilities for client-cli
 *
 * Checks for running CLI server via ~/.mark/server.lock
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
const LOCKFILE_PATH = path.join(os.homedir(), ".mark", "server.lock");
/**
 * Read server lockfile
 */
export async function readLockfile() {
    try {
        const content = await fs.readFile(LOCKFILE_PATH, "utf-8");
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
/**
 * Check if server process is still alive
 */
export async function isServerAlive(lockfile) {
    try {
        // Check if process is running by sending signal 0
        process.kill(lockfile.pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=lockfile.js.map