/**
 * Importing this file registers the procedures of @procedures/sqlite, and of the modules that it
 * requires, in the global registry: `import "@procedures/sqlite/register"`. The package root and the
 * `./module` entry register nothing (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */

import { registerSqliteProcedures } from "./module.js";

export * from "./module.js";

registerSqliteProcedures();
