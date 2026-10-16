/**
 * Importing this file registers the procedures of @procedures/env in the global registry:
 * `import "@procedures/env/register"`. The package root registers nothing.
 */

import { registerEnvProcedures } from "./module.js";

export * from "./module.js";

registerEnvProcedures();
