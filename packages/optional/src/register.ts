/**
 * Importing this file registers the procedures of @procedures/optional in the global registry:
 * `import "@procedures/optional/register"`. The package root registers nothing.
 */

import { registerOptionalProcedures } from "./module.js";

export * from "./module.js";

registerOptionalProcedures();
