/**
 * Importing this file registers the procedures of @procedures/exif in the global registry:
 * `import "@procedures/exif/register"`. The package root registers nothing.
 */

import { registerExifProcedures } from "./module.js";

export * from "./module.js";

registerExifProcedures();
