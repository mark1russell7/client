/**
 * Universal Error Registry
 *
 * Central source of truth for all error codes across all transports.
 * Each error code has rich metadata including summary, detail, category, etc.
 *
 * NO MAGIC STRINGS - everything is defined in the registry!
 */
import { ErrorCategory, type ErrorRegistry, type ErrorMetadata } from "./types";
/**
 * Universal Error Registry
 *
 * Protocol-agnostic error codes with rich metadata.
 */
export declare const ERROR_REGISTRY: ErrorRegistry;
/**
 * Get error metadata by code.
 *
 * Returns UNKNOWN metadata if code not found in registry.
 */
export declare function getErrorMetadata(code: string): ErrorMetadata;
/**
 * Check if an error code exists in the registry.
 */
export declare function isKnownError(code: string): boolean;
/**
 * Get all error codes by category.
 */
export declare function getErrorsByCategory(category: ErrorCategory): ErrorMetadata[];
/**
 * Get all retryable error codes.
 */
export declare function getRetryableErrors(): ErrorMetadata[];
/**
 * Map HTTP status code to error code.
 */
export declare function httpStatusToErrorCode(status: number): string;
//# sourceMappingURL=registry.d.ts.map