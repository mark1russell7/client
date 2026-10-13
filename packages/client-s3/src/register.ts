/**
 * Importing this file registers the procedures of @procedures/s3, and of the modules that it
 * requires, in the global registry: `import "@procedures/s3/register"`. The package root and the
 * `./module` entry register nothing (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */

import { registerS3Procedures } from "./module.js";

export * from "./module.js";

registerS3Procedures();
