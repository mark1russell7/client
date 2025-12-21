/**
 * ecosystem.procedures
 *
 * Enumerates all procedures across the ecosystem by:
 * 1. Scanning all packages (lib.scan)
 * 2. Loading each package's procedure registry
 * 3. Aggregating using the collector pattern (pure)
 *
 * This is a composition of dag traversal + procedure discovery.
 */
import { z } from "zod";
import { libScan } from "../lib/scan.js";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
// =============================================================================
// Types
// =============================================================================
export const EcosystemProceduresInputSchema = z.object({
    /** Root path to scan (defaults to ~/git) */
    rootPath: z.string().optional(),
    /** Filter by namespace prefix */
    namespace: z.string().optional(),
    /** Include full metadata */
    includeMetadata: z.boolean().default(false),
});
function collect(items, collector) {
    const acc = collector.supplier();
    for (const item of items) {
        collector.accumulator(acc, item);
    }
    return collector.finisher(acc);
}
// Collector that aggregates PackageProcedures into EcosystemProceduresOutput
function ecosystemProceduresCollector(namespace) {
    return {
        supplier: () => ({
            procedures: [],
            byPackage: [],
            byNamespace: new Map(),
        }),
        accumulator: (acc, pkg) => {
            acc.byPackage.push(pkg);
            for (const proc of pkg.procedures) {
                // Filter by namespace if specified
                if (namespace && proc.path[0] !== namespace) {
                    continue;
                }
                acc.procedures.push(proc);
                // Group by namespace
                const ns = proc.path[0] ?? "root";
                if (!acc.byNamespace.has(ns)) {
                    acc.byNamespace.set(ns, []);
                }
                acc.byNamespace.get(ns).push(proc);
            }
        },
        finisher: (acc) => {
            const namespaces = [...acc.byNamespace.keys()].sort();
            return {
                procedures: acc.procedures,
                byPackage: acc.byPackage,
                byNamespace: Object.fromEntries(acc.byNamespace),
                summary: {
                    totalPackages: acc.byPackage.length,
                    packagesWithProcedures: acc.byPackage.filter(p => p.procedures.length > 0).length,
                    totalProcedures: acc.procedures.length,
                    namespaces,
                },
            };
        },
    };
}
// =============================================================================
// Package Procedure Discovery
// =============================================================================
async function discoverPackageProcedures(packageName, packagePath, _ctx) {
    try {
        // Read package.json to find client.procedures entry
        const pkgJsonPath = join(packagePath, "package.json");
        const pkgJsonContent = await readFile(pkgJsonPath, "utf-8");
        const pkgJson = JSON.parse(pkgJsonContent);
        if (!pkgJson.client?.procedures) {
            return {
                name: packageName,
                path: packagePath,
                procedures: [],
                success: true,
            };
        }
        // Dynamically import the procedures register file
        const proceduresPath = join(packagePath, pkgJson.client.procedures);
        // Import to trigger registration
        try {
            await import(proceduresPath);
        }
        catch (importError) {
            // May already be imported or path issue - continue anyway
        }
        // Query the global registry for procedures from this package
        // We identify procedures by checking if they're in a namespace that
        // matches the package pattern (e.g., client-fs -> fs.*)
        const { PROCEDURE_REGISTRY } = await import("@mark1russell7/client");
        const allProcs = PROCEDURE_REGISTRY.getAll();
        // Extract namespace from package name (e.g., @mark1russell7/client-fs -> fs)
        const match = packageName.match(/@mark1russell7\/client-(\w+)/);
        const expectedNamespace = match ? match[1] : null;
        const procedures = [];
        for (const proc of allProcs) {
            // For now, include all procedures but mark their source
            // A more sophisticated approach would track which package registered which procedure
            const meta = proc.metadata;
            const description = meta?.["description"];
            const tags = meta?.["tags"];
            // Heuristic: if first path segment matches expected namespace, it's from this package
            if (expectedNamespace && proc.path[0] === expectedNamespace) {
                procedures.push({
                    path: proc.path,
                    key: proc.path.join("."),
                    package: packageName,
                    packagePath,
                    description,
                    tags,
                });
            }
            else if (packageName === "@mark1russell7/client-lib" && proc.path[0] === "lib") {
                procedures.push({
                    path: proc.path,
                    key: proc.path.join("."),
                    package: packageName,
                    packagePath,
                    description,
                    tags,
                });
            }
            else if (packageName === "@mark1russell7/client-cli" &&
                (proc.path[0] === "procedure" || proc.path[0] === "dag")) {
                procedures.push({
                    path: proc.path,
                    key: proc.path.join("."),
                    package: packageName,
                    packagePath,
                    description,
                    tags,
                });
            }
        }
        return {
            name: packageName,
            path: packagePath,
            procedures,
            success: true,
        };
    }
    catch (error) {
        return {
            name: packageName,
            path: packagePath,
            procedures: [],
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
// =============================================================================
// Main Procedure
// =============================================================================
export async function ecosystemProcedures(input, ctx) {
    // Step 1: Scan all packages
    const scanResult = await libScan({ rootPath: input.rootPath }, ctx);
    // Step 2: Discover procedures in each package
    const packageResults = [];
    for (const [name, info] of Object.entries(scanResult.packages)) {
        // Only process client-* packages (they have procedures)
        if (name.includes("/client-") || name === "@mark1russell7/client") {
            const result = await discoverPackageProcedures(name, info.repoPath, ctx);
            packageResults.push(result);
        }
    }
    // Step 3: Aggregate using collector pattern
    const output = collect(packageResults, ecosystemProceduresCollector(input.namespace));
    return output;
}
//# sourceMappingURL=procedures.js.map