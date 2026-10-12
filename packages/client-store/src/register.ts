/**
 * Procedure registration for client-store
 *
 * The procedures of the store: `procedure.register` and the program store procedures
 * `procedure.store`, `load`, `sync` and `remote`. The core registered the older versions of them
 * before they moved here (roadmap 3.2).
 */

import { PROCEDURE_REGISTRY } from "@mark1russell7/client";
import { procedureStorageProcedures } from "./procedures.js";

export function register(): void {
  // Override makes the registration idempotent (two copies of the package in one process)
  PROCEDURE_REGISTRY.registerAll(procedureStorageProcedures, { override: true });
}

// Auto-register
register();
