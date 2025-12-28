/**
 * CLI Client Mode
 *
 * Connects to a running CLI server and executes commands remotely.
 * Falls back to local execution if no server is available.
 */
import type { AnyProcedure } from "@mark1russell7/client";
interface ClientModeResult {
    success: boolean;
    result?: unknown;
    error?: string;
}
/**
 * Try to execute command via running server
 * Returns null if no server available (should fall back to local)
 */
export declare function tryClientMode(path: string[], args: string[], options: Record<string, unknown>, procedures: AnyProcedure[]): Promise<ClientModeResult | null>;
export {};
//# sourceMappingURL=client-mode.d.ts.map