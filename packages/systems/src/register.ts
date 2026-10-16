/**
 * Importing this file registers the procedures of @procedures/systems in the global registry:
 * `import "@procedures/systems/register"`. The package root registers nothing.
 */

import { registerSystemsProcedures } from "./module.js";

export * from "./module.js";

registerSystemsProcedures();
