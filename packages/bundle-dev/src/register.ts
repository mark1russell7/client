/**
 * Importing this file registers the procedures of @procedures/bundle-dev, and of the modules that it
 * requires, in the global registry: `import "@procedures/bundle-dev/register"`. The package root and the
 * `./module` entry register nothing (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */

import { registerBundleDevProcedures } from "./module.js";

export * from "./module.js";

registerBundleDevProcedures();
