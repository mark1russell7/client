/**
 * Importing this file registers the procedures of @procedures/schedule in the global registry:
 * `import "@procedures/schedule/register"`. The package root registers nothing.
 */

import { registerScheduleProcedures } from "./module.js";

export * from "./module.js";

registerScheduleProcedures();
