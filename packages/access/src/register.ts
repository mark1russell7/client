/**
 * Importing this file registers the procedures of @procedures/access in the global registry:
 * `import "@procedures/access/register"`. The package root registers nothing.
 */

import { registerAccessProcedures } from "./module.js";

export * from "./module.js";

registerAccessProcedures();
