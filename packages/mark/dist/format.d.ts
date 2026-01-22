/**
 * Output Formatting
 *
 * Formats procedure results for CLI output based on metadata hints.
 */
export type OutputFormat = "text" | "json" | "table" | "streaming";
/**
 * Print interface (used by formatOutput)
 */
export interface Print {
    info: (message: string) => void;
    error: (message: string) => void;
    success: (message: string) => void;
    warning: (message: string) => void;
    table: (data: string[][], options?: {
        format?: string;
    }) => void;
    spin: (message: string) => Spinner;
}
export interface Spinner {
    stop: () => void;
    succeed: (message?: string) => void;
    fail: (message?: string) => void;
    text: string;
}
/**
 * Format and print the result based on output format hint
 */
export declare function formatOutput(print: Print, result: unknown, format?: OutputFormat): void;
//# sourceMappingURL=format.d.ts.map