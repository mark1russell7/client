/**
 * Importing this file registers the procedures of @procedures/restic in the global registry:
 * `import "@procedures/restic/register"`. The package root registers nothing.
 */

import { registerResticProcedures } from "./module.js";

export * from "./module.js";

registerResticProcedures();
