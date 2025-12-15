/**
 * Type-safe Method construction from procedure registry
 *
 * This ensures that Method objects can only be created with valid
 * service/operation combinations that exist in the registry.
 */

import type { Method } from './types.js';

/**
 * Generic typed method that constrains service and operation
 * to values that exist in a procedure registry
 */
export interface TypedMethod<
  TRegistry extends Record<string, Record<string, any>>,
  TService extends keyof TRegistry & string = keyof TRegistry & string,
  TOperation extends keyof TRegistry[TService] & string = keyof TRegistry[TService] & string
> extends Method {
  service: TService;
  operation: TOperation;
}

/**
 * Create a type-safe method object
 *
 * Usage:
 * const method = createMethod<ProcedureRegistry>('collections', 'getDocuments');
 * // Autocomplete for both service and operation!
 * // Compile error if service or operation doesn't exist
 */
export function createMethod<
  TRegistry extends Record<string, Record<string, any>>,
  TService extends keyof TRegistry & string,
  TOperation extends keyof TRegistry[TService] & string
>(
  service: TService,
  operation: TOperation,
  version?: string
): TypedMethod<TRegistry, TService, TOperation> {
  const method: TypedMethod<TRegistry, TService, TOperation> = {
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
export function isValidMethod<TRegistry extends Record<string, Record<string, any>>>(
  method: Method,
  registry: TRegistry
): method is TypedMethod<TRegistry> {
  const service = registry[method.service];
  return (
    typeof method.service === 'string' &&
    method.service in registry &&
    typeof method.operation === 'string' &&
    service !== undefined &&
    method.operation in service
  );
}
