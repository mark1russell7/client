/**
 * Importing this file registers the procedures of @procedures/privacy-scan in the global registry:
 * `import "@procedures/privacy-scan/register"`. The package root registers nothing.
 */

import { registerPrivacyScanProcedures } from "./module.js";

export * from "./module.js";

registerPrivacyScanProcedures();
