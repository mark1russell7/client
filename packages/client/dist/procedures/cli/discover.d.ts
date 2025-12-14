/**
 * Procedure Discovery
 *
 * Generates a TypeScript file with static imports for all discovered procedures.
 *
 * Fast path: Reads from .client-registry.json (populated by `client announce`)
 * Fallback: Scans node_modules for packages with `client.procedures`
 *
 * This is compile-time discovery - the generated file contains static imports
 * that get compiled/bundled with your application.
 */
export interface DiscoverOptions {
    /** Output file path */
    output: string;
    /** Root directory to scan from */
    root: string;
    /** Watch mode for development */
    watch: boolean;
    /** Check if generated file is up-to-date (CI mode) */
    check: boolean;
    /** Verbose logging */
    verbose: boolean;
}
/**
 * Run procedure discovery.
 */
export declare function discover(options: DiscoverOptions): Promise<void>;
//# sourceMappingURL=discover.d.ts.map