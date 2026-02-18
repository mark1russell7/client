/**
 * Interactive REPL Mode
 *
 * Starts an interactive session with fast command execution via HTTP.
 * By default, starts its own server on a random port.
 * Use --connect to connect to an existing server.
 */
export interface ReplOptions {
    /** Connect to existing server instead of starting one */
    connect?: boolean | undefined;
    /** Port to connect to (with --connect) or start on */
    port?: number | undefined;
    /** Verbose output */
    verbose?: boolean | undefined;
}
/**
 * Start the interactive REPL
 */
export declare function startRepl(options: ReplOptions): Promise<void>;
//# sourceMappingURL=repl.d.ts.map