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
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
// =============================================================================
// Discovery
// =============================================================================
/**
 * Expand ~ to home directory
 */
function expandPath(p) {
    if (p.startsWith("~/")) {
        return path.join(os.homedir(), p.slice(2));
    }
    return p;
}
/**
 * Read and parse JSON file
 */
function readJson(filePath) {
    try {
        const content = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
/**
 * Discover packages with procedures from ecosystem manifest
 */
export function discoverFromEcosystem() {
    const discovered = [];
    // Find ecosystem manifest
    const manifestPath = path.join(os.homedir(), "git", "ecosystem", "ecosystem.manifest.json");
    const manifest = readJson(manifestPath);
    if (!manifest) {
        // Manifest not found, return empty
        return discovered;
    }
    const rootDir = expandPath(manifest.root);
    // Check each package for client.procedures
    const packageNames = Object.keys(manifest.packages);
    for (let i = 0; i < packageNames.length; i++) {
        const packageName = packageNames[i];
        const entry = manifest.packages[packageName];
        const packageDir = path.join(rootDir, entry.path);
        const packageJsonPath = path.join(packageDir, "package.json");
        const packageJson = readJson(packageJsonPath);
        if (packageJson?.client?.procedures) {
            discovered.push({
                name: packageName,
                path: packageDir,
                proceduresPath: packageJson.client.procedures,
            });
        }
    }
    return discovered;
}
/**
 * Dynamically load procedures from discovered packages
 */
export async function loadEcosystemProcedures(verbose = false) {
    const discovered = discoverFromEcosystem();
    const loaded = [];
    for (const pkg of discovered) {
        try {
            // Build the full path to the procedures file
            const proceduresFullPath = path.join(pkg.path, pkg.proceduresPath);
            // Check if file exists
            if (!fs.existsSync(proceduresFullPath)) {
                if (verbose) {
                    console.warn(`Procedures file not found: ${proceduresFullPath}`);
                }
                continue;
            }
            // Dynamic import - the module will self-register procedures
            // Use file:// URL for Windows compatibility
            const fileUrl = `file://${proceduresFullPath.replace(/\\/g, "/")}`;
            await import(fileUrl);
            loaded.push(pkg.name);
            if (verbose) {
                console.log(`Loaded procedures from: ${pkg.name}`);
            }
        }
        catch (error) {
            if (verbose) {
                console.warn(`Failed to load procedures from ${pkg.name}:`, error);
            }
        }
    }
    return loaded;
}
/**
 * Get list of ecosystem packages that have procedures
 */
export function listEcosystemProcedurePackages() {
    return discoverFromEcosystem().map((pkg) => ({
        name: pkg.name,
        path: pkg.path,
    }));
}
//# sourceMappingURL=ecosystem.js.map