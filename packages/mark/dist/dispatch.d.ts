/**
 * Generic Dispatcher
 *
 * Dispatches CLI commands to client procedures.
 * This is the core of the declarative CLI system.
 */
import type { CommandSpec, ParsedArgs } from "./types.js";
import "@mark1russell7/client-cli";
import "@mark1russell7/client-logger";
/**
 * Dispatch a CLI command to its corresponding procedure
 *
 * @param spec - The command specification
 * @param parsed - The parsed CLI arguments
 * @returns The procedure result
 */
export declare function dispatch(spec: CommandSpec, parsed: ParsedArgs): Promise<unknown>;
/**
 * Format the result for CLI output
 */
export declare function formatResult(result: unknown): string;
//# sourceMappingURL=dispatch.d.ts.map