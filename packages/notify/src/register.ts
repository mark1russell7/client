/**
 * Importing this file registers the procedures of @procedures/notify in the global registry:
 * `import "@procedures/notify/register"`. The package root registers nothing.
 */

import { registerNotifyProcedures } from "./module.js";

export * from "./module.js";

registerNotifyProcedures();
