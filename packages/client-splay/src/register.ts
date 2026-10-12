/**
 * Importing this file registers the bridge procedures of @procedures/splay in the
 * global registry (DECISIONS-2026-10, "Every package root registers its procedures"). The
 * procedures as data are in `module.ts`, which registers nothing.
 */

import { PROCEDURE_REGISTRY } from "@procedures/client";
import { splayModule } from "./module.js";

export * from "./module.js";

export function registerBridge(): void {
  // override: calling the exported function again (after the auto-register) must not throw
  PROCEDURE_REGISTRY.registerAll(splayModule.procedures, { override: true });
}

// Auto-register
registerBridge();
