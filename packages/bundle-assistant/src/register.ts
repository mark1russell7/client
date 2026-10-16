/**
 * Importing this file registers the procedures of @procedures/bundle-assistant in the global registry:
 * `import "@procedures/bundle-assistant/register"`. The package root registers nothing.
 */

import { registerBundleAssistantProcedures } from "./module.js";

export * from "./module.js";

registerBundleAssistantProcedures();
