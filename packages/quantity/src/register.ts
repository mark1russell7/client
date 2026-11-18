/**
 * Importing this file registers the procedures of @procedures/quantity in the global registry:
 * `import "@procedures/quantity/register"`. The package root registers nothing.
 */

import { registerQuantityProcedures } from "./module.js";

export * from "./module.js";

registerQuantityProcedures();
