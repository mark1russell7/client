/**
 * Zod Validation Types
 *
 * Type definitions for schema validation middleware.
 * Works with Zod as an optional peer dependency.
 */
/**
 * Convert a Method object to a registry key string.
 */
export function methodToKey(method) {
    return method.version
        ? `${method.service}.${method.operation}.${method.version}`
        : `${method.service}.${method.operation}`;
}
/**
 * Parse a method key back to a Method object.
 */
export function keyToMethod(key) {
    const parts = key.split(".");
    if (parts.length === 3 && parts[2]) {
        return { service: parts[0], operation: parts[1], version: parts[2] };
    }
    return { service: parts[0], operation: parts[1] };
}
/**
 * Error thrown when validation fails.
 */
export class ValidationError extends Error {
    phase;
    zodError;
    method;
    name = "ValidationError";
    constructor(message, 
    /** Which phase of validation failed */
    phase, 
    /** The underlying Zod error */
    zodError, 
    /** The method being called */
    method) {
        super(message);
        this.phase = phase;
        this.zodError = zodError;
        this.method = method;
        // Maintain proper stack trace in V8 environments
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ValidationError);
        }
    }
    /**
     * Get formatted validation error details.
     */
    get details() {
        const errors = this.zodError.errors
            .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
            .join("\n");
        return `${this.phase} validation failed for ${this.method.service}.${this.method.operation}:\n${errors}`;
    }
}
//# sourceMappingURL=types.js.map