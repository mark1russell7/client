/**
 * Importing this file registers the procedures of @procedures/gh in the global registry:
 * `import "@procedures/gh/register"`. The package root registers nothing.
 */

import { registerGhProcedures } from "./module.js";

export * from "./module.js";

registerGhProcedures();
