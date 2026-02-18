/**
 * Interactive REPL Mode
 *
 * Thin wrapper around the CLI. Loads procedures once,
 * then executes each line through the same code path as `mark <command>`.
 */
export interface ReplOptions {
    /** Verbose output */
    verbose?: boolean | undefined;
}
/**
 * Start the interactive REPL
 */
export declare function startRepl(options: ReplOptions): Promise<void>;
//# sourceMappingURL=repl.d.ts.map