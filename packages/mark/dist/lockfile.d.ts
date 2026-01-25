/**
 * Lockfile Management
 *
 * Manages the CLI server lockfile for client discovery.
 * Lockfile location: ~/.mark/server.lock
 */
export interface LockfileData {
    pid: number;
    port: number;
    transport: string;
    endpoint: string;
    startedAt: string;
}
/**
 * Write server lockfile
 */
export declare function writeLockfile(data: LockfileData): Promise<void>;
/**
 * Read server lockfile
 */
export declare function readLockfile(): Promise<LockfileData | null>;
/**
 * Remove server lockfile
 */
export declare function removeLockfile(): Promise<void>;
/**
 * Check if server process is still alive
 */
export declare function isServerAlive(lockfile: LockfileData): Promise<boolean>;
/**
 * Get lockfile path (for debugging)
 */
export declare function getLockfilePath(): string;
/**
 * Get log file path
 */
export declare function getLogPath(): string;
/**
 * Get lockfile directory path
 */
export declare function getLockfileDir(): string;
/**
 * Rotate log file (move current to .1)
 */
export declare function rotateLogFile(): Promise<void>;
//# sourceMappingURL=lockfile.d.ts.map