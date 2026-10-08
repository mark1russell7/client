/**
 * Terminal Output Utilities
 *
 * Replaces Gluegun's print with Chalk + Ora + cli-table3
 * Provides a consistent interface for CLI output.
 */
import chalk from "chalk";
/**
 * Spinner interface (compatible with existing code)
 */
export interface Spinner {
    stop: () => void;
    succeed: (message?: string) => void;
    fail: (message?: string) => void;
    text: string;
}
/**
 * Print utilities
 */
export declare const print: {
    info: (msg: string) => void;
    success: (msg: string) => void;
    error: (msg: string) => void;
    warning: (msg: string) => void;
    muted: (msg: string) => void;
    highlight: (msg: string) => void;
    spin: (msg: string) => Spinner;
    table: (data: string[][], _options?: {
        format?: string;
    }) => void;
    divider: () => void;
    newline: () => void;
};
/**
 * Print interface type for external use
 */
export type Print = typeof print;
/**
 * Re-export chalk for direct color access
 */
export { chalk };
//# sourceMappingURL=print.d.ts.map