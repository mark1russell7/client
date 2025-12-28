/**
 * Lockfile Utilities for client-cli
 *
 * Checks for running CLI server via ~/.mark/server.lock
 */
export interface LockfileData {
    pid: number;
    port: number;
    transport: string;
    endpoint: string;
    startedAt: string;
}
/**
 * Read server lockfile
 */
export declare function readLockfile(): Promise<LockfileData | null>;
/**
 * Check if server process is still alive
 */
export declare function isServerAlive(lockfile: LockfileData): Promise<boolean>;
//# sourceMappingURL=lockfile.d.ts.map