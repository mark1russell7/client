/**
 * Importing this file registers the procedures of @mark1russell7/client-git in the global registry
 * (DECISIONS-2026-10, "Every package root registers its procedures"). The procedures as data
 * are in `module.ts`, which registers nothing: a host with its own registry uses that one.
 */

import { registerProcedures } from "@mark1russell7/client";
import { gitModule } from "./module.js";

export * from "./module.js";

export function registerGitProcedures(): void {
  registerProcedures(gitModule.procedures);
}

// Auto-register when this module is loaded
registerGitProcedures();
