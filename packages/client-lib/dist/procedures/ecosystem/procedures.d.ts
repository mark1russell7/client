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
export declare const EcosystemProceduresInputSchema: z.ZodObject<{
    rootPath: z.ZodOptional<z.ZodString>;
    namespace: z.ZodOptional<z.ZodString>;
    includeMetadata: z.ZodDefault<z.ZodBoolean>;
}>;
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
export declare function ecosystemProcedures(input: EcosystemProceduresInput, ctx: ProcedureContext): Promise<EcosystemProceduresOutput>;
//# sourceMappingURL=procedures.d.ts.map