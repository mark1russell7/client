/**
 * Ecosystem-based Procedure Discovery
 *
 * Dynamically discovers and loads procedures from the ecosystem manifest.
 * This enables the CLI to automatically find all available procedures
 * without hardcoding imports.
 *
 * Discovery flow:
 * 1. Read ecosystem.manifest.json from ~/git/ecosystem/
 * 2. For each package, read its package.json
 * 3. If it has client.procedures, dynamically import it
 * 4. Procedures auto-register via PROCEDURE_REGISTRY
 */
interface DiscoveredPackage {
    name: string;
    path: string;
    proceduresPath: string;
}
/**
 * Discover packages with procedures from ecosystem manifest
 */
export declare function discoverFromEcosystem(): DiscoveredPackage[];
/**
 * Dynamically load procedures from discovered packages
 */
export declare function loadEcosystemProcedures(verbose?: boolean): Promise<string[]>;
/**
 * Get list of ecosystem packages that have procedures
 */
export declare function listEcosystemProcedurePackages(): Array<{
    name: string;
    path: string;
}>;
export {};
//# sourceMappingURL=ecosystem.d.ts.map