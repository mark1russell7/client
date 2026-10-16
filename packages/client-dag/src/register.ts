/**
 * Importing this file registers the procedures of @procedures/dag in the global registry:
 * `import "@procedures/dag/register"`. The package root and the `./module` entry register nothing
 * (ARCHITECTURE-PROPOSALS-2026-10, P9). `dag.traverse` calls `lib.scan`: also import
 * `@procedures/lib/register`.
 */

import { registerDagProcedures } from "./module.js";

export * from "./module.js";

registerDagProcedures();
