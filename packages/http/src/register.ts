/**
 * Importing this file registers the procedures of @procedures/http in the global registry:
 * `import "@procedures/http/register"`. The package root registers nothing.
 */

import { registerHttpProcedures } from "./module.js";

export * from "./module.js";

registerHttpProcedures();
