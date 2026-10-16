/**
 * Importing this file registers the procedures of @procedures/server in the global registry:
 * `import "@procedures/server/register"`. The package root and the `./module` entry register
 * nothing (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */

import { registerServerProcedures } from "./module.js";

export * from "./module.js";

registerServerProcedures();
