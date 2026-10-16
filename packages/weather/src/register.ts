/**
 * Importing this file registers the procedures of @procedures/weather in the global registry:
 * `import "@procedures/weather/register"`. The package root registers nothing.
 */

import { registerWeatherProcedures } from "./module.js";

export * from "./module.js";

registerWeatherProcedures();
