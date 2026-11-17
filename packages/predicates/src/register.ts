/**
 * Importing this file registers the procedures of @procedures/predicates in the global registry:
 * `import "@procedures/predicates/register"`. The package root registers nothing.
 */

import { registerPredicatesProcedures } from "./module.js";

export * from "./module.js";

registerPredicatesProcedures();
