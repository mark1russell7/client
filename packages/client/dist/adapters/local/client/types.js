/**
 * Local Transport Types
 *
 * Type definitions and utilities for Local adapter.
 */
/**
 * Method key for handler registry.
 */
export function methodKey(method) {
    const version = method.version || "";
    return `${version}:${method.service}.${method.operation}`;
}
//# sourceMappingURL=types.js.map