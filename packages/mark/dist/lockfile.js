"use strict";
/**
 * Lockfile Management
 *
 * Manages the CLI server lockfile for client discovery.
 * Lockfile location: ~/.mark/server.lock
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeLockfile = writeLockfile;
exports.readLockfile = readLockfile;
exports.removeLockfile = removeLockfile;
exports.isServerAlive = isServerAlive;
exports.getLockfilePath = getLockfilePath;
const tslib_1 = require("tslib");
const fs = tslib_1.__importStar(require("node:fs/promises"));
const path = tslib_1.__importStar(require("node:path"));
const os = tslib_1.__importStar(require("node:os"));
const LOCKFILE_DIR = path.join(os.homedir(), ".mark");
const LOCKFILE_PATH = path.join(LOCKFILE_DIR, "server.lock");
/**
 * Write server lockfile
 */
async function writeLockfile(data) {
    await fs.mkdir(LOCKFILE_DIR, { recursive: true });
    await fs.writeFile(LOCKFILE_PATH, JSON.stringify(data, null, 2));
}
/**
 * Read server lockfile
 */
async function readLockfile() {
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
async function removeLockfile() {
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
async function isServerAlive(lockfile) {
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
function getLockfilePath() {
    return LOCKFILE_PATH;
}
//# sourceMappingURL=lockfile.js.map