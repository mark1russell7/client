/**
 * Procedure Registration for CLI operations
 *
 * NOTE: All procedures have been moved to their canonical homes:
 * - lib.* procedures are registered by client-lib
 * - procedure.* procedures are registered by client-procedure
 * - dag.* procedures are registered by client-lib
 *
 * This file is kept for backwards compatibility but registers nothing.
 */

import { registerProcedures } from "@mark1russell7/client";

// =============================================================================
// Registration
// =============================================================================

export function registerCliProcedures(): void {
  // All procedures have been moved to their canonical packages:
  // - client-lib: lib.*, ecosystem.*, dag.*
  // - client-procedure: procedure.*
  registerProcedures([]);
}

// Auto-register (no-op now)
registerCliProcedures();
