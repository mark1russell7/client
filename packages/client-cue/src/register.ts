/**
 * Importing this file registers the procedures of @mark1russell7/client-cue in the global registry
 * (DECISIONS-2026-10, "Every package root registers its procedures"). The procedures as data
 * are in `module.ts`, which registers nothing: a host with its own registry uses that one.
 */

// The cue procedures read and write files through fs.*: register them wherever cue.* runs.
// (Over the MCP server, fs.* was not registered, so every cue tool failed: deep dive WRP-3.)
import "@mark1russell7/client-fs";

import { registerProcedures } from "@mark1russell7/client";
import { cueModule } from "./module.js";

export * from "./module.js";

export function registerCueProcedures(): void {
  registerProcedures(cueModule.procedures);
}

// Auto-register when this module is loaded
registerCueProcedures();
