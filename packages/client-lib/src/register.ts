/**
 * Importing this file registers the procedures of @procedures/lib in the global registry
 * (DECISIONS-2026-10, "Every package root registers its procedures"). The procedures as data
 * are in `module.ts`, which registers nothing: a host with its own registry uses that one.
 */

// The lib procedures call fs.* and git.* (their `calls` below). Importing those packages registers
// them, so client-lib works alone. (Docs review DOC-5: before, lib.scan alone found no packages,
// and over MCP its git calls failed with NOT_FOUND.)
import "@procedures/fs";
import "@procedures/git";

import { registerProcedures } from "@procedures/client";
import { libModule } from "./module.js";

export * from "./module.js";

export function registerLibProcedures(): void {
  registerProcedures(libModule.procedures);
}

// Auto-register when this module is loaded
registerLibProcedures();
