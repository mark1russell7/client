/**
 * Importing this file registers the procedures of @procedures/mail in the global registry:
 * `import "@procedures/mail/register"`. The package root registers nothing.
 */

import { registerMailProcedures } from "./module.js";

export * from "./module.js";

registerMailProcedures();
