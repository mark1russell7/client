/**
 * Process Manager - Manages spawned Node.js processes
 */
import { ChildProcess } from "child_process";
import type { ProcessInfo } from "./types.js";
interface ManagedProcess {
    process: ChildProcess;
    script: string;
    startedAt: Date;
    exitCode?: number;
    exitedAt?: Date;
    error?: Error;
}
declare class ProcessManager {
    private processes;
    private counter;
    /**
     * Register a spawned process for management
     */
    register(process: ChildProcess, script: string): string;
    /**
     * Get a managed process by ID
     */
    get(processId: string): ManagedProcess | undefined;
    /**
     * Kill a process by ID
     */
    kill(processId: string, signal?: NodeJS.Signals): boolean;
    /**
     * Wait for a ready pattern in stdout
     */
    waitForReady(processId: string, pattern: string, timeout?: number): Promise<void>;
    /**
     * Get status of all or specific processes
     */
    getStatus(processId?: string): ProcessInfo[];
    private getProcessStatus;
    /**
     * Cleanup exited processes
     */
    cleanup(): number;
}
export declare const processManager: ProcessManager;
export {};
//# sourceMappingURL=process-manager.d.ts.map