/**
 * An import of this file registers the procedures of @procedures/ocr in the global registry:
 * `import "@procedures/ocr/register"`. The package root registers nothing.
 */

import { registerOcrProcedures } from "./module.js";

export * from "./module.js";

registerOcrProcedures();
