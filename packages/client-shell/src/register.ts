/**
 * Importing this file registers the procedures of @procedures/shell, and of the modules that it
 * requires, in the global registry: `import "@procedures/shell/register"`. The package root and the
 * `./module` entry register nothing (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */

import { registerShellProcedures } from "./module.js";

export * from "./module.js";

registerShellProcedures();
