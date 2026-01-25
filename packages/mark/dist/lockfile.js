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
const LOG_PATH = path.join(LOCKFILE_DIR, "server.log");
const LOG_PREV_PATH = path.join(LOCKFILE_DIR, "server.log.1");
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
/**
 * Get log file path
 */
export function getLogPath() {
    return LOG_PATH;
}
/**
 * Get lockfile directory path
 */
export function getLockfileDir() {
    return LOCKFILE_DIR;
}
/**
 * Rotate log file (move current to .1)
 */
export async function rotateLogFile() {
    try {
        await fs.mkdir(LOCKFILE_DIR, { recursive: true });
        // Check if current log exists
        try {
            await fs.access(LOG_PATH);
            // Move current to previous
            await fs.rename(LOG_PATH, LOG_PREV_PATH);
        }
        catch {
            // No current log, nothing to rotate
        }
    }
    catch {
        // Ignore rotation errors
    }
}
//# sourceMappingURL=lockfile.js.map