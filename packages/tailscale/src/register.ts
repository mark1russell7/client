/**
 * Importing this file registers the procedures of @procedures/tailscale in the global registry:
 * `import "@procedures/tailscale/register"`. The package root registers nothing.
 */

import { registerTailscaleProcedures } from "./module.js";

export * from "./module.js";

registerTailscaleProcedures();
