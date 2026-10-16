/**
 * Importing this file registers the procedures of @procedures/json in the global registry:
 * `import "@procedures/json/register"`. The package root registers nothing.
 */

import { registerJsonProcedures } from "./module.js";

export * from "./module.js";

registerJsonProcedures();
