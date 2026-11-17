/**
 * Importing this file registers the procedures of @procedures/rational in the global registry:
 * `import "@procedures/rational/register"`. The package root registers nothing.
 */

import { registerRationalProcedures } from "./module.js";

export * from "./module.js";

registerRationalProcedures();
