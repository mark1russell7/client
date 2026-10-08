#!/usr/bin/env node
/**
 * Mark CLI
 *
 * A generic CLI that reflects registered procedures.
 * Uses custom procedure-based routing with modern terminal utilities.
 */
import type { AnyProcedure } from "@mark1russell7/client";
/**
 * CLI execution context, created once and reused
 */
export interface CliContext {
    client: InstanceType<typeof import("@mark1russell7/client").Client>;
    procedures: AnyProcedure[];
    verbose: boolean;
}
/**
 * Initialize the CLI context (load ecosystem, create client)
 * This is the expensive part (~4s). Call once, reuse many times.
 */
export declare function initCli(verbose?: boolean): Promise<CliContext>;
/**
 * Execute a single command given argv tokens.
 * Reusable by both CLI entry point and REPL.
 */
export declare function executeArgs(argv: string[], ctx: CliContext): Promise<void>;
/**
 * Run the CLI
 */
declare function run(argv: string[]): Promise<void>;
export { run };
//# sourceMappingURL=cli.d.ts.map