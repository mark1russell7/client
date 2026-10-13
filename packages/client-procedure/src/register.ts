/**
 * Importing this file registers the procedures of @procedures/procedure, and of the modules that it
 * requires, in the global registry: `import "@procedures/procedure/register"`. The package root and the
 * `./module` entry register nothing (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */

import { registerProcedureProcedures } from "./module.js";

export * from "./module.js";

registerProcedureProcedures();
