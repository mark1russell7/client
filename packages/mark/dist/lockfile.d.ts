/**
 * Lockfile Management
 *
 * Manages CLI server lockfiles for client discovery.
 * Each server gets its own lockfile: ~/.mark/servers/<port>.lock
 */
export interface LockfileData {
    pid: number;
    port: number;
    transport: string;
    endpoint: string;
    startedAt: string;
}
/**
 * Write server lockfile for a specific port
 */
export declare function writeLockfile(data: LockfileData): Promise<void>;
/**
 * Read lockfile for a specific port
 */
export declare function readLockfileForPort(port: number): Promise<LockfileData | null>;
/**
 * Read any available server lockfile (for client-mode auto-discovery)
 */
export declare function readLockfile(): Promise<LockfileData | null>;
/**
 * Read all server lockfiles
 */
export declare function readAllLockfiles(): Promise<LockfileData[]>;
/**
 * Remove server lockfile for a specific port
 */
export declare function removeLockfileForPort(port: number): Promise<void>;
/**
 * Remove server lockfile (legacy - removes the single lockfile)
 */
export declare function removeLockfile(): Promise<void>;
/**
 * Check if server process is still alive
 */
export declare function isServerAlive(lockfile: LockfileData): Promise<boolean>;
/**
 * Get lockfile directory path
 */
export declare function getLockfileDir(): string;
/**
 * Get servers directory path
 */
export declare function getServersDir(): string;
/**
 * Get log file path
 */
export declare function getLogPath(): string;
/**
 * Get lockfile path (for display)
 */
export declare function getLockfilePath(): string;
/**
 * Rotate log file (move current to .1)
 */
export declare function rotateLogFile(): Promise<void>;
//# sourceMappingURL=lockfile.d.ts.map