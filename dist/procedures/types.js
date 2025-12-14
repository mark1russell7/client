/**
 * Procedure Type System
 *
 * Core types for procedure definitions, handlers, and registration.
 * Procedures are the foundation for typed RPC calls with schema validation.
 */
/**
 * Convert path array to dot-separated key.
 */
export function pathToKey(path) {
    return path.join(".");
}
/**
 * Parse dot-separated key to path array.
 */
export function keyToPath(key) {
    return key.split(".");
}
//# sourceMappingURL=types.js.map