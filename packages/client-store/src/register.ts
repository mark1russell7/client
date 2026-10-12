/**
 * Procedure registration for client-store
 *
 * The procedures of the store: `procedure.store`, `load`, `sync`, `remote` and `register`. The
 * core registered them before they moved here (roadmap 3.2).
 */

import { PROCEDURE_REGISTRY } from "@mark1russell7/client";
import { procedureStorageProcedures } from "./storage/procedures.js";

export function register(): void {
  // Override makes the registration idempotent (two copies of the package in one process)
  PROCEDURE_REGISTRY.registerAll(procedureStorageProcedures, { override: true });
}

// Auto-register
register();
