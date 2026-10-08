/**
 * HTTP Error Registry Extension
 *
 * Comprehensive HTTP status code mappings with full metadata.
 * Integrates with the universal error registry system.
 */
import { type ErrorMetadata } from "./types.js";
import { ErrorCode } from "./codes.js";
import { HTTPStatus } from "./http-status.js";
/**
 * HTTP Status Code Error Registry
 *
 * Complete mapping of all HTTP status codes to rich error metadata.
 */
export declare const HTTP_ERROR_REGISTRY: Record<string, ErrorMetadata>;
/**
 * Map HTTP status code to error code (client-side).
 *
 * Uses bidirectional mapping - NO MAGIC STRINGS OR NUMBERS!
 *
 * @param status - HTTP status number
 * @returns Error code from enum
 *
 * @example
 * ```typescript
 * const code = httpStatusToErrorCode(404); // ErrorCode.NOT_FOUND
 * const code2 = httpStatusToErrorCode(500); // ErrorCode.INTERNAL_ERROR
 * ```
 */
export declare function httpStatusToErrorCode(status: number): ErrorCode;
/**
 * Map error code to HTTP status code (server-side).
 *
 * Used by servers to determine appropriate HTTP status for an error code.
 * Uses bidirectional mapping - NO MAGIC STRINGS OR NUMBERS!
 *
 * @param code - Error code from enum
 * @returns HTTP status number
 *
 * @example
 * ```typescript
 * const status = errorCodeToHTTPStatus(ErrorCode.NOT_FOUND); // 404
 * const status2 = errorCodeToHTTPStatus(ErrorCode.INTERNAL_ERROR); // 500
 * ```
 */
export declare function errorCodeToHTTPStatus(code: ErrorCode): HTTPStatus;
//# sourceMappingURL=http-errors.d.ts.map