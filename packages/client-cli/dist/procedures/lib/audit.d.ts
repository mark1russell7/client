/**
 * lib.audit procedure
 *
 * Validates all registered packages against the ecosystem's projectTemplate.
 * Reads the template from ecosystem.manifest.json (single source of truth).
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { LibAuditInput, LibAuditOutput } from "../../types.js";
/**
 * Audit all packages in the ecosystem against projectTemplate
 */
export declare function libAudit(input: LibAuditInput, ctx: ProcedureContext): Promise<LibAuditOutput>;
//# sourceMappingURL=audit.d.ts.map