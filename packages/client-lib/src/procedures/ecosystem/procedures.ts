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
import type { ProcedureContext } from "@mark1russell7/client";
import { libScan } from "../lib/scan.js";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

// =============================================================================
// Types
// =============================================================================

export const EcosystemProceduresInputSchema: z.ZodObject<{
  rootPath: z.ZodOptional<z.ZodString>;
  namespace: z.ZodOptional<z.ZodString>;
  includeMetadata: z.ZodDefault<z.ZodBoolean>;
}> = z.object({
  /** Root path to scan (defaults to ~/git) */
  rootPath: z.string().optional(),
  /** Filter by namespace prefix */
  namespace: z.string().optional(),
  /** Include full metadata */
  includeMetadata: z.boolean().default(false),
});

export type EcosystemProceduresInput = z.infer<typeof EcosystemProceduresInputSchema>;

export interface ProcedureInfo {
  /** Procedure path as array */
  path: string[];
  /** Procedure path as dot-separated key */
  key: string;
  /** Source package */
  package: string;
  /** Package path on disk */
  packagePath: string;
  /** Description from metadata */
  description?: string | undefined;
  /** Tags from metadata */
  tags?: string[] | undefined;
}

export interface PackageProcedures {
  /** Package name */
  name: string;
  /** Package path */
  path: string;
  /** Procedures defined in this package */
  procedures: ProcedureInfo[];
  /** Whether loading succeeded */
  success: boolean;
  /** Error if loading failed */
  error?: string;
}

export interface EcosystemProceduresOutput {
  /** All procedures aggregated */
  procedures: ProcedureInfo[];
  /** Procedures grouped by package */
  byPackage: PackageProcedures[];
  /** Procedures grouped by namespace */
  byNamespace: Record<string, ProcedureInfo[]>;
  /** Summary counts */
  summary: {
    totalPackages: number;
    packagesWithProcedures: number;
    totalProcedures: number;
    namespaces: string[];
  };
}

// =============================================================================
// Collector Pattern Implementation
// =============================================================================

interface Collector<T, A, R> {
  supplier: () => A;
  accumulator: (acc: A, element: T) => void;
  finisher: (acc: A) => R;
}

function collect<T, A, R>(items: Iterable<T>, collector: Collector<T, A, R>): R {
  const acc = collector.supplier();
  for (const item of items) {
    collector.accumulator(acc, item);
  }
  return collector.finisher(acc);
}

// Collector that aggregates PackageProcedures into EcosystemProceduresOutput
function ecosystemProceduresCollector(namespace?: string): Collector<
  PackageProcedures,
  {
    procedures: ProcedureInfo[];
    byPackage: PackageProcedures[];
    byNamespace: Map<string, ProcedureInfo[]>;
  },
  EcosystemProceduresOutput
> {
  return {
    supplier: () => ({
      procedures: [],
      byPackage: [],
      byNamespace: new Map<string, ProcedureInfo[]>(),
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
        acc.byNamespace.get(ns)!.push(proc);
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

async function discoverPackageProcedures(
  packageName: string,
  packagePath: string,
  _ctx: ProcedureContext
): Promise<PackageProcedures> {
  try {
    // Read package.json to find client.procedures entry
    const pkgJsonPath = join(packagePath, "package.json");
    const pkgJsonContent = await readFile(pkgJsonPath, "utf-8");
    const pkgJson = JSON.parse(pkgJsonContent) as {
      client?: { procedures?: string };
    };

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
    } catch (importError) {
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

    const procedures: ProcedureInfo[] = [];

    for (const proc of allProcs) {
      // For now, include all procedures but mark their source
      // A more sophisticated approach would track which package registered which procedure
      const meta = proc.metadata as Record<string, unknown> | undefined;
      const description = meta?.["description"] as string | undefined;
      const tags = meta?.["tags"] as string[] | undefined;

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
      } else if (packageName === "@mark1russell7/client-lib" && proc.path[0] === "lib") {
        procedures.push({
          path: proc.path,
          key: proc.path.join("."),
          package: packageName,
          packagePath,
          description,
          tags,
        });
      } else if (packageName === "@mark1russell7/client-cli" &&
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
  } catch (error) {
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

export async function ecosystemProcedures(
  input: EcosystemProceduresInput,
  ctx: ProcedureContext
): Promise<EcosystemProceduresOutput> {
  // Step 1: Scan all packages
  const scanResult = await libScan({ rootPath: input.rootPath }, ctx);

  // Step 2: Discover procedures in each package
  const packageResults: PackageProcedures[] = [];

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
