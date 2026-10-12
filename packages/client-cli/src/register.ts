/**
 * Importing this file registers the procedures of @mark1russell7/client-cli in the global registry
 * (DECISIONS-2026-10, "Every package root registers its procedures"). The procedures as data
 * are in `module.ts`, which registers nothing: a host with its own registry uses that one.
 */

// Import shell dependency to ensure shell.exec is registered
import "@mark1russell7/client-shell";

import { registerProcedures } from "@mark1russell7/client";
import { cliModule } from "./module.js";

export * from "./module.js";

export function registerCliProcedures(): void {
  registerProcedures(cliModule.procedures);
}

// Auto-register when this module is loaded
registerCliProcedures();
