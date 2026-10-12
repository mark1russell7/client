/**
 * Importing this file registers the procedures of @mark1russell7/client-vite in the global registry
 * (DECISIONS-2026-10, "Every package root registers its procedures"). The procedures as data
 * are in `module.ts`, which registers nothing: a host with its own registry uses that one.
 */

import { registerProcedures } from "@mark1russell7/client";
import { viteModule } from "./module.js";

export * from "./module.js";

export function registerViteProcedures(): void {
  registerProcedures(viteModule.procedures);
}

// Auto-register when this module is loaded
registerViteProcedures();
