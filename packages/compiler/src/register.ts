/**
 * Importing this file registers the procedures of @procedures/compiler in the global registry:
 * `import "@procedures/compiler/register"`. The package root registers nothing.
 */

import { registerCompilerProcedures } from "./module.js";

export * from "./module.js";

registerCompilerProcedures();
