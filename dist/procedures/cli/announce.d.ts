/**
 * Procedure Announcement (Self-Registration)
 *
 * When a package with procedures is installed, it "announces" itself
 * by writing to a registry file at the root of the project.
 *
 * This enables true bottom-up propagation:
 * - Each package with procedures has `"postinstall": "client announce"`
 * - On install, it walks up to find the root and registers itself
 * - `client discover` reads this registry instead of scanning
 *
 * The registry file (.client-registry.json) accumulates entries from
 * all packages as they're installed, making discovery instant.
 */
export interface AnnounceOptions {
    /** Be verbose about what's happening */
    verbose: boolean;
}
interface RegistryEntry {
    /** Path to procedures file relative to package */
    proceduresPath: string;
    /** When this entry was added */
    registeredAt: string;
    /** Package version */
    version?: string;
}
interface Registry {
    /** Schema version for future compatibility */
    schemaVersion: 1;
    /** Map of package name to registry entry */
    packages: Record<string, RegistryEntry>;
}
declare const REGISTRY_FILENAME = ".client-registry.json";
/**
 * Announce this package's procedures to the project registry.
 *
 * Called from a package's postinstall script to register its procedures.
 */
export declare function announce(options: AnnounceOptions): Promise<void>;
/**
 * Remove this package from the registry (for uninstall).
 */
export declare function unannounce(options: AnnounceOptions): Promise<void>;
/**
 * Get the registry for use by discover command.
 */
export declare function getRegistry(rootDir: string): Promise<Registry>;
export { REGISTRY_FILENAME };
export type { Registry, RegistryEntry };
//# sourceMappingURL=announce.d.ts.map