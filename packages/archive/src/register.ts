/**
 * Importing this file registers the procedures of @procedures/archive in the global registry:
 * `import "@procedures/archive/register"`. The package root registers nothing.
 */

import { registerArchiveProcedures } from "./module.js";

export * from "./module.js";

registerArchiveProcedures();
