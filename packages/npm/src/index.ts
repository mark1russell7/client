// The root registers nothing: import "<package>/register", or give the module to createRegistry()
export * from "./module.js";
export * from "./types.js";
export * from "./procedures/npm/index.js";
// How the procedures find npm (no shell): other packages that run npm can use it too
export { resolveNpm } from "./procedures/npm/shared.js";
export { parseDistTags } from "./procedures/npm/distTags/list.js";
