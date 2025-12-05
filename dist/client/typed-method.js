/**
 * Type-safe Method construction from procedure registry
 *
 * This ensures that Method objects can only be created with valid
 * service/operation combinations that exist in the registry.
 */
/**
 * Create a type-safe method object
 *
 * Usage:
 * const method = createMethod<ProcedureRegistry>('collections', 'getDocuments');
 * // Autocomplete for both service and operation!
 * // Compile error if service or operation doesn't exist
 */
export function createMethod(service, operation, version) {
    const method = {
        service,
        operation,
    };
    if (version !== undefined) {
        method.version = version;
    }
    return method;
}
/**
 * Type guard to check if a Method matches the registry
 */
export function isValidMethod(method, registry) {
    const service = registry[method.service];
    return (typeof method.service === 'string' &&
        method.service in registry &&
        typeof method.operation === 'string' &&
        service !== undefined &&
        method.operation in service);
}
//# sourceMappingURL=typed-method.js.map