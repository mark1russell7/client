/**
 * Mock utilities for testing procedures
 *
 * Provides mock factories for Client, ProcedureContext, and other core types.
 */
import type { Mock } from "vitest";
/**
 * Mock ProcedureContext for unit testing procedures
 */
export interface MockProcedureContext {
    cwd: string;
    log: {
        info: Mock;
        warn: Mock;
        error: Mock;
        debug: Mock;
    };
    client: {
        call: Mock;
        exec: Mock;
    };
}
/**
 * Create a mock ProcedureContext
 */
export declare function createMockContext(options?: {
    cwd?: string;
}): MockProcedureContext;
/**
 * Mock child_process exec for testing shell commands
 */
export interface MockExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
export declare function createMockExec(results: Map<string, MockExecResult>): Mock;
/**
 * Mock filesystem operations
 */
export interface MockFs {
    files: Map<string, string>;
    dirs: Set<string>;
    readFile: Mock;
    writeFile: Mock;
    mkdir: Mock;
    readdir: Mock;
    stat: Mock;
    exists: Mock;
}
export declare function createMockFs(initialFiles?: Record<string, string>, initialDirs?: string[]): MockFs;
//# sourceMappingURL=index.d.ts.map