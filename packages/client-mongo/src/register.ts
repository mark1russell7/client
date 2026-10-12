/**
 * Importing this file registers the procedures of @procedures/mongo in the global registry
 * (DECISIONS-2026-10, "Every package root registers its procedures"). The procedures as data
 * are in `module.ts`, which registers nothing: a host with its own registry uses that one.
 */

import { registerProcedures } from "@procedures/client";
import { mongoModule } from "./module.js";

export * from "./module.js";

export function registerMongoProcedures(): void {
  registerProcedures(mongoModule.procedures);
}

// Auto-register when this module is loaded
registerMongoProcedures();
