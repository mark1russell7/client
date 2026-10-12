/**
 * Importing this file registers the procedures of @procedures/docker in the global registry
 * (DECISIONS-2026-10, "Every package root registers its procedures"). The procedures as data
 * are in `module.ts`, which registers nothing: a host with its own registry uses that one.
 */

// Import shell dependency to ensure shell.exec is registered
import "@procedures/shell";

import { registerProcedures } from "@procedures/client";
import { dockerModule } from "./module.js";

export * from "./module.js";

export function registerDockerProcedures(): void {
  registerProcedures(dockerModule.procedures);
}

// Auto-register when this module is loaded
registerDockerProcedures();
