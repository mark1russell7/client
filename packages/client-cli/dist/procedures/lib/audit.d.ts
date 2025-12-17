/**
 * lib.audit procedure
 *
 * Validates all registered packages against the ecosystem's projectTemplate.
 * Reads the template from ecosystem.manifest.json (single source of truth).
 */
import type { LibAuditInput, LibAuditOutput } from "../../types.js";
/**
 * Audit all packages in the ecosystem against projectTemplate
 */
export declare function libAudit(input: LibAuditInput): Promise<LibAuditOutput>;
//# sourceMappingURL=audit.d.ts.map