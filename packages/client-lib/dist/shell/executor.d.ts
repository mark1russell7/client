/**
 * Shell command executor with output capture
 */
export interface ShellResult {
    /** Exit code */
    code: number;
    /** Standard output */
    stdout: string;
    /** Standard error */
    stderr: string;
    /** Combined output in order */
    output: string;
    /** Whether the command succeeded (code === 0) */
    success: boolean;
}
export interface ShellOptions {
    /** Working directory */
    cwd?: string | undefined;
    /** Environment variables */
    env?: Record<string, string> | undefined;
    /** Timeout in milliseconds */
    timeout?: number | undefined;
    /** Whether to use shell (default: true on Windows) */
    shell?: boolean | undefined;
}
/**
 * Execute a shell command and capture output
 */
export declare function executeCommand(command: string, args?: string[], options?: ShellOptions): Promise<ShellResult>;
/**
 * Execute pnpm install
 */
export declare function pnpmInstall(cwd: string): Promise<ShellResult>;
/**
 * Execute pnpm run build
 */
export declare function pnpmBuild(cwd: string): Promise<ShellResult>;
/**
 * Remove a directory recursively
 */
export declare function removeDir(path: string): Promise<ShellResult>;
/**
 * Remove a file
 */
export declare function removeFile(path: string): Promise<ShellResult>;
//# sourceMappingURL=executor.d.ts.map