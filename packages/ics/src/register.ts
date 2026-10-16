/**
 * Importing this file registers the procedures of @procedures/ics in the global registry:
 * `import "@procedures/ics/register"`. The package root registers nothing.
 */

import { registerIcsProcedures } from "./module.js";

export * from "./module.js";

registerIcsProcedures();
