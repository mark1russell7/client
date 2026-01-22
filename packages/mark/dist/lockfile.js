/**
 * Lockfile Management
 *
 * Manages the CLI server lockfile for client discovery.
 * Lockfile location: ~/.mark/server.lock
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
const LOCKFILE_DIR = path.join(os.homedir(), ".mark");
const LOCKFILE_PATH = path.join(LOCKFILE_DIR, "server.lock");
/**
 * Write server lockfile
 */
export async function writeLockfile(data) {
    await fs.mkdir(LOCKFILE_DIR, { recursive: true });
    await fs.writeFile(LOCKFILE_PATH, JSON.stringify(data, null, 2));
}
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
 * Remove server lockfile
 */
export async function removeLockfile() {
    try {
        await fs.unlink(LOCKFILE_PATH);
    }
    catch {
        // Ignore if doesn't exist
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
        // Process not running, clean up stale lockfile
        await removeLockfile();
        return false;
    }
}
/**
 * Get lockfile path (for debugging)
 */
export function getLockfilePath() {
    return LOCKFILE_PATH;
}
//# sourceMappingURL=lockfile.js.map