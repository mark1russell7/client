/**
 * General test utilities
 */
/**
 * Wait for a condition to be true
 */
export declare function waitFor(condition: () => boolean | Promise<boolean>, options?: {
    timeout?: number;
    interval?: number;
}): Promise<void>;
/**
 * Sleep for a specified duration
 */
export declare function sleep(ms: number): Promise<void>;
/**
 * Capture console output during a test
 */
export interface CapturedOutput {
    stdout: string[];
    stderr: string[];
}
export declare function captureOutput(fn: () => void | Promise<void>): Promise<CapturedOutput>;
/**
 * Assert that a function throws with a specific message
 */
export declare function assertThrows(fn: () => void | Promise<void>, expectedMessage?: string | RegExp): Promise<Error>;
/**
 * Create a deferred promise for async testing
 */
export interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
}
export declare function createDeferred<T = void>(): Deferred<T>;
/**
 * Run a function with a timeout
 */
export declare function withTimeout<T>(fn: () => Promise<T>, timeout: number, message?: string): Promise<T>;
//# sourceMappingURL=index.d.ts.map