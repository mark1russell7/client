/**
 * Importing this file registers the procedures of @procedures/statistics in the global registry:
 * `import "@procedures/statistics/register"`. The package root registers nothing.
 */

import { registerStatisticsProcedures } from "./module.js";

export * from "./module.js";

registerStatisticsProcedures();
