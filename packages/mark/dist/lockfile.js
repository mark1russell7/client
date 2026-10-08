/**
 * Lockfile Management
 *
 * Manages CLI server lockfiles for client discovery.
 * Each server gets its own lockfile: ~/.mark/servers/<port>.lock
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
const MARK_DIR = path.join(os.homedir(), ".mark");
const SERVERS_DIR = path.join(MARK_DIR, "servers");
const LOG_PATH = path.join(MARK_DIR, "server.log");
const LOG_PREV_PATH = path.join(MARK_DIR, "server.log.1");
// Legacy single lockfile (for migration)
const LEGACY_LOCKFILE_PATH = path.join(MARK_DIR, "server.lock");
/**
 * Get lockfile path for a specific port
 */
function lockfilePath(port) {
    return path.join(SERVERS_DIR, `${port}.lock`);
}
/**
 * Write server lockfile for a specific port
 */
export async function writeLockfile(data) {
    await fs.mkdir(SERVERS_DIR, { recursive: true });
    await fs.writeFile(lockfilePath(data.port), JSON.stringify(data, null, 2));
    // Also write legacy lockfile for backward compat
    await fs.writeFile(LEGACY_LOCKFILE_PATH, JSON.stringify(data, null, 2));
}
/**
 * Read lockfile for a specific port
 */
export async function readLockfileForPort(port) {
    try {
        const content = await fs.readFile(lockfilePath(port), "utf-8");
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
/**
 * Read any available server lockfile (for client-mode auto-discovery)
 */
export async function readLockfile() {
    const all = await readAllLockfiles();
    // Return first alive server
    for (const data of all) {
        if (await isServerAlive(data)) {
            return data;
        }
    }
    return null;
}
/**
 * Read all server lockfiles
 */
export async function readAllLockfiles() {
    const results = [];
    try {
        const files = await fs.readdir(SERVERS_DIR);
        for (const file of files) {
            if (file.endsWith(".lock")) {
                try {
                    const content = await fs.readFile(path.join(SERVERS_DIR, file), "utf-8");
                    results.push(JSON.parse(content));
                }
                catch {
                    // Skip corrupt lockfiles
                }
            }
        }
    }
    catch {
        // Directory doesn't exist yet
    }
    // Also check legacy lockfile if no per-port files found
    if (results.length === 0) {
        try {
            const content = await fs.readFile(LEGACY_LOCKFILE_PATH, "utf-8");
            const data = JSON.parse(content);
            results.push(data);
        }
        catch {
            // No legacy lockfile
        }
    }
    return results;
}
/**
 * Remove server lockfile for a specific port
 */
export async function removeLockfileForPort(port) {
    try {
        await fs.unlink(lockfilePath(port));
    }
    catch {
        // Ignore if doesn't exist
    }
    // Also try to clean legacy lockfile if it matches this port
    try {
        const content = await fs.readFile(LEGACY_LOCKFILE_PATH, "utf-8");
        const data = JSON.parse(content);
        if (data.port === port) {
            await fs.unlink(LEGACY_LOCKFILE_PATH);
        }
    }
    catch {
        // Ignore
    }
}
/**
 * Remove server lockfile (legacy - removes the single lockfile)
 */
export async function removeLockfile() {
    try {
        await fs.unlink(LEGACY_LOCKFILE_PATH);
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
        process.kill(lockfile.pid, 0);
        return true;
    }
    catch {
        // Process not running, clean up stale lockfile
        await removeLockfileForPort(lockfile.port);
        return false;
    }
}
/**
 * Get lockfile directory path
 */
export function getLockfileDir() {
    return MARK_DIR;
}
/**
 * Get servers directory path
 */
export function getServersDir() {
    return SERVERS_DIR;
}
/**
 * Get log file path
 */
export function getLogPath() {
    return LOG_PATH;
}
/**
 * Get lockfile path (for display)
 */
export function getLockfilePath() {
    return LEGACY_LOCKFILE_PATH;
}
/**
 * Rotate log file (move current to .1)
 */
export async function rotateLogFile() {
    try {
        await fs.mkdir(MARK_DIR, { recursive: true });
        try {
            await fs.access(LOG_PATH);
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