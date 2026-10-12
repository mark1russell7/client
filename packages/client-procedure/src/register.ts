/**
 * Importing this file registers the procedures of @procedures/procedure in the global
 * registry (DECISIONS-2026-10, "Every package root registers its procedures"). The procedures as
 * data are in `module.ts`, which registers nothing: a host with its own registry uses that one.
 */

import { PROCEDURE_REGISTRY } from "@procedures/client";
import { procedureModule } from "./module.js";

export * from "./module.js";

export function registerProcedureProcedures(): void {
  // Override makes the registration idempotent. procedure.list and procedure.get are the core
  // ones: this package does not replace them (docs review DOC-6).
  PROCEDURE_REGISTRY.registerAll(procedureModule.procedures, { override: true });
}

// Auto-register
registerProcedureProcedures();
