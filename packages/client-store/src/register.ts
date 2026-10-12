/**
 * Importing this file registers the procedures of @procedures/store in the global
 * registry (DECISIONS-2026-10, "Every package root registers its procedures"). The procedures as
 * data are in `module.ts`, which registers nothing: a host with its own registry uses that one.
 */

import { PROCEDURE_REGISTRY } from "@procedures/client";
import { storeModule } from "./module.js";

export * from "./module.js";

export function register(): void {
  // Override makes the registration idempotent (two copies of the package in one process)
  PROCEDURE_REGISTRY.registerAll(storeModule.procedures, { override: true });
}

// Auto-register
register();
