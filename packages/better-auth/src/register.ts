/**
 * Importing this file registers the procedures of @procedures/better-auth in the global registry:
 * `import "@procedures/better-auth/register"`. The package root registers nothing.
 */

import { registerBetterAuthProcedures } from "./module.js";

export * from "./module.js";

registerBetterAuthProcedures();
