/**
 * The use measures of npm packages, as pure pairs of a request builder and an extractor. This entry has no Node
 * built-in and registers nothing, so a browser can also use it.
 */
export { type Extracted, type Extractor, type MeasureFetch, type MeasureRequest, assertExistingPackageName, measure } from "./shared.js";
export * from "./downloads.js";
export * from "./deps-dev.js";
export * from "./jsdelivr.js";
export * from "./registry.js";
