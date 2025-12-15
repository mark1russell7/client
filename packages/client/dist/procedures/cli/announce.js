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
import * as fs from "node:fs/promises";
import * as path from "node:path";
// =============================================================================
// Path Utilities
// =============================================================================
/**
 * Find the root of the project (topmost directory with package.json that isn't in node_modules).
 */
async function findProjectRoot(startDir) {
    let current = path.resolve(startDir);
    let lastValidRoot = null;
    while (true) {
        const pkgPath = path.join(current, "package.json");
        try {
            await fs.access(pkgPath);
            // Check if we're inside node_modules
            const isInNodeModules = current.includes("node_modules");
            if (!isInNodeModules) {
                // This is a valid root candidate
                lastValidRoot = current;
            }
        }
        catch {
            // No package.json here
        }
        const parent = path.dirname(current);
        if (parent === current) {
            // Reached filesystem root
            break;
        }
        current = parent;
    }
    return lastValidRoot;
}
/**
 * Find the package that contains the current directory.
 * This is the package that depends on client and is being installed.
 */
async function findContainingPackage(startDir) {
    let current = path.resolve(startDir);
    while (true) {
        const pkgPath = path.join(current, "package.json");
        try {
            const content = await fs.readFile(pkgPath, "utf-8");
            const pkg = JSON.parse(content);
            return { dir: current, pkg };
        }
        catch {
            // No package.json here, go up
        }
        const parent = path.dirname(current);
        if (parent === current) {
            // Reached filesystem root
            break;
        }
        current = parent;
    }
    return null;
}
// =============================================================================
// Registry Operations
// =============================================================================
const REGISTRY_FILENAME = ".client-registry.json";
/**
 * Read the registry file, or return empty registry if it doesn't exist.
 */
async function readRegistry(rootDir) {
    const registryPath = path.join(rootDir, REGISTRY_FILENAME);
    try {
        const content = await fs.readFile(registryPath, "utf-8");
        return JSON.parse(content);
    }
    catch {
        return {
            schemaVersion: 1,
            packages: {},
        };
    }
}
/**
 * Write the registry file.
 */
async function writeRegistry(rootDir, registry) {
    const registryPath = path.join(rootDir, REGISTRY_FILENAME);
    const content = JSON.stringify(registry, null, 2) + "\n";
    await fs.writeFile(registryPath, content, "utf-8");
}
// =============================================================================
// Main
// =============================================================================
/**
 * Announce this package's procedures to the project registry.
 *
 * Called from a package's postinstall script to register its procedures.
 * Also propagates the postinstall script to the parent package for transitive discovery.
 */
export async function announce(options) {
    const { verbose } = options;
    // Find the package we're in (the one being installed)
    const containing = await findContainingPackage(process.cwd());
    if (!containing) {
        if (verbose) {
            console.log("[client] No package.json found, skipping announcement");
        }
        return;
    }
    const { dir: packageDir, pkg } = containing;
    // Check if this package declares procedures
    if (!pkg.client?.procedures) {
        // Even if no procedures, check if we should propagate postinstall to parent
        await propagatePostinstall(packageDir, verbose);
        if (verbose) {
            console.log(`[client] ${pkg.name} does not declare procedures, checked parent propagation`);
        }
        return;
    }
    // Propagate postinstall to this package if it doesn't have it
    await ensurePostinstall(packageDir, pkg, verbose);
    // Find the project root
    const projectRoot = await findProjectRoot(packageDir);
    if (!projectRoot) {
        if (verbose) {
            console.log("[client] Could not find project root, skipping announcement");
        }
        return;
    }
    // Don't register if we ARE the project root (we're the app, not a dependency)
    if (path.resolve(packageDir) === path.resolve(projectRoot)) {
        if (verbose) {
            console.log(`[client] ${pkg.name} is the project root, skipping self-announcement`);
        }
        return;
    }
    // Read current registry
    const registry = await readRegistry(projectRoot);
    // Add/update our entry
    const entry = {
        proceduresPath: pkg.client.procedures,
        registeredAt: new Date().toISOString(),
    };
    if (pkg.version) {
        entry.version = pkg.version;
    }
    registry.packages[pkg.name] = entry;
    // Write updated registry
    await writeRegistry(projectRoot, registry);
    if (verbose) {
        console.log(`[client] Registered ${pkg.name} -> ${pkg.client.procedures}`);
    }
}
/**
 * Ensure a package has the postinstall script for propagation.
 */
async function ensurePostinstall(packageDir, pkg, verbose) {
    const pkgPath = path.join(packageDir, "package.json");
    const fullPkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"));
    const scripts = (fullPkg["scripts"] ?? {});
    const postinstall = scripts["postinstall"] ?? "";
    // Check if postinstall already includes client announce
    if (postinstall.includes("client announce")) {
        return;
    }
    // Add client announce to postinstall
    const newPostinstall = postinstall
        ? `${postinstall} && client announce 2>/dev/null || true`
        : "client announce 2>/dev/null || true";
    scripts["postinstall"] = newPostinstall;
    fullPkg["scripts"] = scripts;
    await fs.writeFile(pkgPath, JSON.stringify(fullPkg, null, 2) + "\n", "utf-8");
    if (verbose) {
        console.log(`[client] Added postinstall to ${pkg.name}`);
    }
}
/**
 * Propagate postinstall to parent package (for transitive dependencies).
 * When client is installed, walk up to the parent and add postinstall if it has client.procedures.
 */
async function propagatePostinstall(startDir, verbose) {
    // Walk up from current location to find parent package with client.procedures
    let current = path.dirname(startDir);
    while (true) {
        // Skip node_modules directories in the path
        if (current.endsWith("node_modules")) {
            current = path.dirname(current);
            continue;
        }
        const pkgPath = path.join(current, "package.json");
        try {
            const content = await fs.readFile(pkgPath, "utf-8");
            const pkg = JSON.parse(content);
            // Found a package - check if it has client.procedures
            if (pkg.client?.procedures) {
                await ensurePostinstall(current, pkg, verbose);
            }
            // Only process the immediate parent package, not all ancestors
            break;
        }
        catch {
            // No package.json here
        }
        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }
}
/**
 * Remove this package from the registry (for uninstall).
 */
export async function unannounce(options) {
    const { verbose } = options;
    const containing = await findContainingPackage(process.cwd());
    if (!containing)
        return;
    const { dir: packageDir, pkg } = containing;
    const projectRoot = await findProjectRoot(packageDir);
    if (!projectRoot)
        return;
    const registry = await readRegistry(projectRoot);
    if (registry.packages[pkg.name]) {
        delete registry.packages[pkg.name];
        await writeRegistry(projectRoot, registry);
        if (verbose) {
            console.log(`[client] Unregistered ${pkg.name}`);
        }
    }
}
/**
 * Get the registry for use by discover command.
 */
export async function getRegistry(rootDir) {
    return readRegistry(rootDir);
}
export { REGISTRY_FILENAME };
//# sourceMappingURL=announce.js.map