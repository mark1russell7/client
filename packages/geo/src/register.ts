/**
 * Importing this file registers the procedures of @procedures/geo in the global registry:
 * `import "@procedures/geo/register"`. The package root registers nothing.
 */

import { registerGeoProcedures } from "./module.js";

export * from "./module.js";

registerGeoProcedures();
