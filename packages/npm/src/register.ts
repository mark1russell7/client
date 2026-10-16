/**
 * Importing this file registers the procedures of @procedures/npm in the global registry:
 * `import "@procedures/npm/register"`. The package root registers nothing.
 */

import { registerNpmProcedures } from "./module.js";

export * from "./module.js";

registerNpmProcedures();
