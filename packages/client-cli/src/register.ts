/**
 * Importing this file registers the procedures of @procedures/cli-run, and of the modules that it
 * requires, in the global registry: `import "@procedures/cli-run/register"`. The package root and the
 * `./module` entry register nothing (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */

import { registerCliProcedures } from "./module.js";

export * from "./module.js";

registerCliProcedures();
