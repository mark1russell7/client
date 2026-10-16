/**
 * An import of this file registers the procedures of @procedures/pdf in the global registry:
 * `import "@procedures/pdf/register"`. The package root registers nothing.
 */

import { registerPdfProcedures } from "./module.js";

export * from "./module.js";

registerPdfProcedures();
