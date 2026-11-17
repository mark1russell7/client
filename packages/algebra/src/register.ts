/**
 * Importing this file registers the procedures of @procedures/algebra in the global registry:
 * `import "@procedures/algebra/register"`. The package root registers nothing.
 */

import { registerAlgebraProcedures } from "./module.js";

export * from "./module.js";

registerAlgebraProcedures();
