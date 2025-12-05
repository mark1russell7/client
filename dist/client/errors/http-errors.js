/**
 * HTTP Error Registry Extension
 *
 * Comprehensive HTTP status code mappings with full metadata.
 * Integrates with the universal error registry system.
 */
import { ErrorCategory, ErrorSeverity } from "./types";
import { ErrorCode } from "./codes";
import { HTTPStatus } from "./http-status";
/**
 * Helper to create HTTP error metadata.
 *
 * Uses HTTPStatus enum - NO MAGIC NUMBERS!
 */
function defineHTTPError(code, httpStatus, meta) {
    const result = {
        code,
        httpStatus,
        summary: meta.summary,
        detail: meta.detail,
        category: meta.category,
        retryable: meta.retryable,
        severity: meta.severity,
        userMessage: meta.userMessage,
        devMessage: meta.devMessage,
    };
    if (meta.suggestions) {
        result.suggestions = meta.suggestions;
    }
    return result;
}
/**
 * Bidirectional HTTP Status <-> Error Code Mapping
 *
 * Single source of truth for status/error associations.
 * Used by both client (status -> code) and server (code -> status).
 *
 * NO MAGIC NUMBERS - uses HTTPStatus enum!
 * NO MAGIC STRINGS - uses ErrorCode enum!
 */
const HTTP_STATUS_ERROR_MAP = [
    // 4xx Client Errors
    [HTTPStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST],
    [HTTPStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED],
    [HTTPStatus.FORBIDDEN, ErrorCode.FORBIDDEN],
    [HTTPStatus.NOT_FOUND, ErrorCode.NOT_FOUND],
    [HTTPStatus.METHOD_NOT_ALLOWED, ErrorCode.METHOD_NOT_ALLOWED],
    [HTTPStatus.NOT_ACCEPTABLE, ErrorCode.NOT_ACCEPTABLE],
    [HTTPStatus.PROXY_AUTHENTICATION_REQUIRED, ErrorCode.PROXY_AUTHENTICATION_REQUIRED],
    [HTTPStatus.REQUEST_TIMEOUT, ErrorCode.TIMEOUT],
    [HTTPStatus.CONFLICT, ErrorCode.CONFLICT],
    [HTTPStatus.GONE, ErrorCode.GONE],
    [HTTPStatus.LENGTH_REQUIRED, ErrorCode.LENGTH_REQUIRED],
    [HTTPStatus.PRECONDITION_FAILED, ErrorCode.PRECONDITION_FAILED],
    [HTTPStatus.PAYLOAD_TOO_LARGE, ErrorCode.PAYLOAD_TOO_LARGE],
    [HTTPStatus.URI_TOO_LONG, ErrorCode.URI_TOO_LONG],
    [HTTPStatus.UNSUPPORTED_MEDIA_TYPE, ErrorCode.UNSUPPORTED_MEDIA_TYPE],
    [HTTPStatus.RANGE_NOT_SATISFIABLE, ErrorCode.RANGE_NOT_SATISFIABLE],
    [HTTPStatus.EXPECTATION_FAILED, ErrorCode.EXPECTATION_FAILED],
    [HTTPStatus.IM_A_TEAPOT, ErrorCode.IM_A_TEAPOT],
    [HTTPStatus.MISDIRECTED_REQUEST, ErrorCode.MISDIRECTED_REQUEST],
    [HTTPStatus.UNPROCESSABLE_ENTITY, ErrorCode.UNPROCESSABLE_ENTITY],
    [HTTPStatus.LOCKED, ErrorCode.LOCKED],
    [HTTPStatus.FAILED_DEPENDENCY, ErrorCode.FAILED_DEPENDENCY],
    [HTTPStatus.TOO_EARLY, ErrorCode.TOO_EARLY],
    [HTTPStatus.UPGRADE_REQUIRED, ErrorCode.UPGRADE_REQUIRED],
    [HTTPStatus.PRECONDITION_REQUIRED, ErrorCode.PRECONDITION_REQUIRED],
    [HTTPStatus.TOO_MANY_REQUESTS, ErrorCode.TOO_MANY_REQUESTS],
    [HTTPStatus.REQUEST_HEADER_FIELDS_TOO_LARGE, ErrorCode.REQUEST_HEADER_FIELDS_TOO_LARGE],
    [HTTPStatus.UNAVAILABLE_FOR_LEGAL_REASONS, ErrorCode.UNAVAILABLE_FOR_LEGAL_REASONS],
    [HTTPStatus.CLIENT_CLOSED_REQUEST, ErrorCode.CLIENT_CLOSED_REQUEST],
    // 5xx Server Errors
    [HTTPStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR],
    [HTTPStatus.NOT_IMPLEMENTED, ErrorCode.NOT_IMPLEMENTED],
    [HTTPStatus.BAD_GATEWAY, ErrorCode.BAD_GATEWAY],
    [HTTPStatus.SERVICE_UNAVAILABLE, ErrorCode.SERVICE_UNAVAILABLE],
    [HTTPStatus.GATEWAY_TIMEOUT, ErrorCode.GATEWAY_TIMEOUT],
    [HTTPStatus.HTTP_VERSION_NOT_SUPPORTED, ErrorCode.HTTP_VERSION_NOT_SUPPORTED],
    [HTTPStatus.VARIANT_ALSO_NEGOTIATES, ErrorCode.VARIANT_ALSO_NEGOTIATES],
    [HTTPStatus.INSUFFICIENT_STORAGE, ErrorCode.INSUFFICIENT_STORAGE],
    [HTTPStatus.LOOP_DETECTED, ErrorCode.LOOP_DETECTED],
    [HTTPStatus.NOT_EXTENDED, ErrorCode.NOT_EXTENDED],
    [HTTPStatus.NETWORK_AUTHENTICATION_REQUIRED, ErrorCode.NETWORK_AUTHENTICATION_REQUIRED],
    [HTTPStatus.NETWORK_CONNECT_TIMEOUT, ErrorCode.HTTP_NETWORK_CONNECT_TIMEOUT],
];
/**
 * HTTP Status Code Error Registry
 *
 * Complete mapping of all HTTP status codes to rich error metadata.
 */
export const HTTP_ERROR_REGISTRY = {
    //
    // ═══ 4xx Client Errors (Additional) ═══
    //
    [ErrorCode.NOT_ACCEPTABLE]: defineHTTPError(ErrorCode.NOT_ACCEPTABLE, HTTPStatus.NOT_ACCEPTABLE, {
        summary: "Not acceptable",
        detail: "The server cannot produce a response matching the accept headers sent by the client.",
        category: ErrorCategory.CLIENT,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "The server cannot provide the requested format.",
        devMessage: "Content negotiation failed. Check Accept headers and available content types.",
        suggestions: [
            "Check Accept header in request",
            "Verify server supports requested content type",
            "Try different accept formats (application/json, etc.)",
        ],
    }),
    [ErrorCode.PROXY_AUTHENTICATION_REQUIRED]: defineHTTPError(ErrorCode.PROXY_AUTHENTICATION_REQUIRED, HTTPStatus.PROXY_AUTHENTICATION_REQUIRED, {
        summary: "Proxy authentication required",
        detail: "Authentication with the proxy server is required before the request can proceed.",
        category: ErrorCategory.AUTH,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "Proxy authentication is required.",
        devMessage: "Proxy requires authentication. Provide Proxy-Authorization header.",
        suggestions: [
            "Provide Proxy-Authorization header",
            "Check proxy credentials",
            "Verify proxy configuration",
        ],
    }),
    [ErrorCode.GONE]: defineHTTPError(ErrorCode.GONE, HTTPStatus.GONE, {
        summary: "Gone",
        detail: "The requested resource is no longer available and will not be available again.",
        category: ErrorCategory.CLIENT,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "This resource is no longer available.",
        devMessage: "Resource permanently removed. No forwarding address known.",
        suggestions: [
            "Remove references to this resource",
            "Check for alternative resources",
            "Update client to handle permanent removal",
        ],
    }),
    [ErrorCode.LENGTH_REQUIRED]: defineHTTPError(ErrorCode.LENGTH_REQUIRED, HTTPStatus.LENGTH_REQUIRED, {
        summary: "Length required",
        detail: "The server requires the Content-Length header to be specified.",
        category: ErrorCategory.CLIENT,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "Request format error.",
        devMessage: "Content-Length header is required. Add Content-Length to request.",
        suggestions: [
            "Add Content-Length header",
            "Verify request body size",
            "Check HTTP client configuration",
        ],
    }),
    [ErrorCode.PRECONDITION_FAILED]: defineHTTPError(ErrorCode.PRECONDITION_FAILED, HTTPStatus.PRECONDITION_FAILED, {
        summary: "Precondition failed",
        detail: "One or more preconditions in the request headers evaluated to false.",
        category: ErrorCategory.CLIENT,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "The precondition check failed.",
        devMessage: "Conditional request headers (If-Match, If-None-Match, etc.) failed. Check ETag/date conditions.",
        suggestions: [
            "Refresh resource state",
            "Check If-Match/If-None-Match headers",
            "Verify Last-Modified conditions",
        ],
    }),
    [ErrorCode.URI_TOO_LONG]: defineHTTPError(ErrorCode.URI_TOO_LONG, HTTPStatus.URI_TOO_LONG, {
        summary: "URI too long",
        detail: "The URI provided was too long for the server to process.",
        category: ErrorCategory.CLIENT,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "The request URL is too long.",
        devMessage: "URI exceeds server limits. Reduce query parameters or switch to POST.",
        suggestions: [
            "Reduce query parameter count",
            "Shorten URL paths",
            "Switch from GET to POST for large payloads",
        ],
    }),
    [ErrorCode.UNSUPPORTED_MEDIA_TYPE]: defineHTTPError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, HTTPStatus.UNSUPPORTED_MEDIA_TYPE, {
        summary: "Unsupported media type",
        detail: "The server does not support the media type in the request payload.",
        category: ErrorCategory.CLIENT,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "The format of your request is not supported.",
        devMessage: "Content-Type not supported by server. Check supported media types.",
        suggestions: [
            "Use application/json content type",
            "Check server supported media types",
            "Verify Content-Type header is correct",
        ],
    }),
    [ErrorCode.RANGE_NOT_SATISFIABLE]: defineHTTPError(ErrorCode.RANGE_NOT_SATISFIABLE, HTTPStatus.RANGE_NOT_SATISFIABLE, {
        summary: "Range not satisfiable",
        detail: "The range specified in the Range header cannot be satisfied.",
        category: ErrorCategory.CLIENT,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "The requested range is not available.",
        devMessage: "Range header specifies invalid or out-of-bounds range.",
        suggestions: [
            "Check Range header values",
            "Verify resource size",
            "Request full resource without Range header",
        ],
    }),
    [ErrorCode.EXPECTATION_FAILED]: defineHTTPError(ErrorCode.EXPECTATION_FAILED, HTTPStatus.EXPECTATION_FAILED, {
        summary: "Expectation failed",
        detail: "The server cannot meet the requirements of the Expect request header.",
        category: ErrorCategory.CLIENT,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "Server cannot meet request expectations.",
        devMessage: "Expect header requirements cannot be met. Remove or modify Expect header.",
        suggestions: [
            "Remove Expect: 100-continue header",
            "Check server capabilities",
            "Modify request expectations",
        ],
    }),
    [ErrorCode.IM_A_TEAPOT]: defineHTTPError(ErrorCode.IM_A_TEAPOT, HTTPStatus.IM_A_TEAPOT, {
        summary: "I'm a teapot",
        detail: "The server refuses to brew coffee because it is, permanently, a teapot (RFC 2324 April Fools' joke).",
        category: ErrorCategory.CLIENT,
        retryable: false,
        severity: ErrorSeverity.INFO,
        userMessage: "This server is a teapot and cannot brew coffee.",
        devMessage: "HTCPCP Easter egg. This is likely a joke response or test endpoint.",
        suggestions: [
            "Check if this is a test/joke endpoint",
            "Verify correct API endpoint",
            "Enjoy the RFC 2324 humor",
        ],
    }),
    [ErrorCode.MISDIRECTED_REQUEST]: defineHTTPError(ErrorCode.MISDIRECTED_REQUEST, HTTPStatus.MISDIRECTED_REQUEST, {
        summary: "Misdirected request",
        detail: "The request was directed at a server that is not able to produce a response.",
        category: ErrorCategory.CLIENT,
        retryable: true,
        severity: ErrorSeverity.ERROR,
        userMessage: "Request sent to wrong server.",
        devMessage: "HTTP/2 connection routing issue. Server cannot handle this authority.",
        suggestions: [
            "Check server hostname",
            "Verify HTTP/2 connection routing",
            "Retry with different connection",
        ],
    }),
    [ErrorCode.LOCKED]: defineHTTPError(ErrorCode.LOCKED, HTTPStatus.LOCKED, {
        summary: "Locked",
        detail: "The resource being accessed is locked (WebDAV).",
        category: ErrorCategory.CLIENT,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "This resource is currently locked.",
        devMessage: "WebDAV resource is locked. Check for active locks and wait for release.",
        suggestions: [
            "Wait for resource to be unlocked",
            "Check who holds the lock",
            "Request lock release",
        ],
    }),
    [ErrorCode.FAILED_DEPENDENCY]: defineHTTPError(ErrorCode.FAILED_DEPENDENCY, HTTPStatus.FAILED_DEPENDENCY, {
        summary: "Failed dependency",
        detail: "The request failed because it depended on another request that failed (WebDAV).",
        category: ErrorCategory.CLIENT,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "Request failed due to dependency failure.",
        devMessage: "Dependent request failed. Check order of operations and dependencies.",
        suggestions: [
            "Verify dependent requests succeeded",
            "Check request order",
            "Review WebDAV transaction logs",
        ],
    }),
    [ErrorCode.TOO_EARLY]: defineHTTPError(ErrorCode.TOO_EARLY, HTTPStatus.TOO_EARLY, {
        summary: "Too early",
        detail: "The server is unwilling to process a request that might be replayed.",
        category: ErrorCategory.CLIENT,
        retryable: true,
        severity: ErrorSeverity.WARNING,
        userMessage: "Request sent too early, please retry.",
        devMessage: "Early data (0-RTT) rejected due to replay risk. Retry after TLS handshake completes.",
        suggestions: [
            "Retry request after connection established",
            "Disable 0-RTT for this request",
            "Wait for full TLS handshake",
        ],
    }),
    [ErrorCode.UPGRADE_REQUIRED]: defineHTTPError(ErrorCode.UPGRADE_REQUIRED, HTTPStatus.UPGRADE_REQUIRED, {
        summary: "Upgrade required",
        detail: "The server requires the client to upgrade to a different protocol.",
        category: ErrorCategory.CLIENT,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "Protocol upgrade required.",
        devMessage: "Server requires protocol upgrade (e.g., HTTP/2, WebSocket). Check Upgrade header.",
        suggestions: [
            "Check Upgrade header in response",
            "Upgrade to requested protocol",
            "Verify client supports required protocol",
        ],
    }),
    [ErrorCode.PRECONDITION_REQUIRED]: defineHTTPError(ErrorCode.PRECONDITION_REQUIRED, HTTPStatus.PRECONDITION_REQUIRED, {
        summary: "Precondition required",
        detail: "The server requires the request to be conditional to prevent lost update problems.",
        category: ErrorCategory.CLIENT,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "Conditional headers are required for this request.",
        devMessage: "Server requires If-Match or similar conditional headers. Add ETags or timestamps.",
        suggestions: [
            "Add If-Match header with current ETag",
            "Use If-Unmodified-Since header",
            "Implement optimistic locking",
        ],
    }),
    [ErrorCode.REQUEST_HEADER_FIELDS_TOO_LARGE]: defineHTTPError(ErrorCode.REQUEST_HEADER_FIELDS_TOO_LARGE, HTTPStatus.REQUEST_HEADER_FIELDS_TOO_LARGE, {
        summary: "Request header fields too large",
        detail: "One or more header fields in the request are too large.",
        category: ErrorCategory.CLIENT,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "Request headers are too large.",
        devMessage: "Request headers exceed server limits. Reduce header size or count.",
        suggestions: [
            "Reduce number of headers",
            "Shorten header values (especially cookies)",
            "Move large data to request body",
        ],
    }),
    [ErrorCode.UNAVAILABLE_FOR_LEGAL_REASONS]: defineHTTPError(ErrorCode.UNAVAILABLE_FOR_LEGAL_REASONS, HTTPStatus.UNAVAILABLE_FOR_LEGAL_REASONS, {
        summary: "Unavailable for legal reasons",
        detail: "The resource is unavailable due to legal reasons (censorship, compliance, etc.).",
        category: ErrorCategory.CLIENT,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "This content is unavailable for legal reasons.",
        devMessage: "Resource blocked by legal requirement. Cannot be accessed from this region/context.",
        suggestions: [
            "Check geographical restrictions",
            "Review content compliance requirements",
            "Contact legal team if unexpected",
        ],
    }),
    [ErrorCode.CLIENT_CLOSED_REQUEST]: defineHTTPError(ErrorCode.CLIENT_CLOSED_REQUEST, HTTPStatus.CLIENT_CLOSED_REQUEST, {
        summary: "Client closed request",
        detail: "The client closed the connection before the server could send a response (nginx-specific).",
        category: ErrorCategory.CANCELLED,
        retryable: false,
        severity: ErrorSeverity.WARNING,
        userMessage: "Request was cancelled.",
        devMessage: "Client aborted connection before response. Check client timeout settings.",
        suggestions: [
            "Increase client timeout",
            "Optimize server response time",
            "Check for client-side cancellations",
        ],
    }),
    //
    // ═══ 5xx Server Errors (Additional) ═══
    //
    [ErrorCode.HTTP_VERSION_NOT_SUPPORTED]: defineHTTPError(ErrorCode.HTTP_VERSION_NOT_SUPPORTED, HTTPStatus.HTTP_VERSION_NOT_SUPPORTED, {
        summary: "HTTP version not supported",
        detail: "The server does not support the HTTP protocol version used in the request.",
        category: ErrorCategory.SERVER,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "HTTP version not supported by server.",
        devMessage: "Server doesn't support HTTP version used. Downgrade to HTTP/1.1 or upgrade server.",
        suggestions: [
            "Check HTTP version in request",
            "Downgrade to HTTP/1.1",
            "Upgrade server to support HTTP/2 or HTTP/3",
        ],
    }),
    [ErrorCode.VARIANT_ALSO_NEGOTIATES]: defineHTTPError(ErrorCode.VARIANT_ALSO_NEGOTIATES, HTTPStatus.VARIANT_ALSO_NEGOTIATES, {
        summary: "Variant also negotiates",
        detail: "Transparent content negotiation for the request results in a circular reference.",
        category: ErrorCategory.SERVER,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "Server configuration error.",
        devMessage: "Content negotiation configuration error causing circular reference.",
        suggestions: [
            "Report to server administrators",
            "Check server content negotiation config",
            "Try specific content type in Accept header",
        ],
    }),
    [ErrorCode.INSUFFICIENT_STORAGE]: defineHTTPError(ErrorCode.INSUFFICIENT_STORAGE, HTTPStatus.INSUFFICIENT_STORAGE, {
        summary: "Insufficient storage",
        detail: "The server cannot store the representation needed to complete the request (WebDAV).",
        category: ErrorCategory.SERVER,
        retryable: true,
        severity: ErrorSeverity.ERROR,
        userMessage: "Server storage is full.",
        devMessage: "Server out of storage space. May be temporary. Check disk space and quotas.",
        suggestions: [
            "Retry after storage is freed",
            "Reduce request payload size",
            "Contact server administrators",
        ],
    }),
    [ErrorCode.LOOP_DETECTED]: defineHTTPError(ErrorCode.LOOP_DETECTED, HTTPStatus.LOOP_DETECTED, {
        summary: "Loop detected",
        detail: "The server detected an infinite loop while processing the request (WebDAV).",
        category: ErrorCategory.SERVER,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "Server detected a loop in request processing.",
        devMessage: "Infinite loop detected in WebDAV Depth header processing. Fix resource structure.",
        suggestions: [
            "Check for circular resource references",
            "Review WebDAV Depth header",
            "Report to server administrators",
        ],
    }),
    [ErrorCode.NOT_EXTENDED]: defineHTTPError(ErrorCode.NOT_EXTENDED, HTTPStatus.NOT_EXTENDED, {
        summary: "Not extended",
        detail: "Further extensions to the request are required for the server to fulfill it.",
        category: ErrorCategory.SERVER,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "Additional request extensions required.",
        devMessage: "Server requires HTTP extensions not present in request (RFC 2774).",
        suggestions: [
            "Check required extensions in response",
            "Add necessary HTTP extensions",
            "Contact server documentation",
        ],
    }),
    [ErrorCode.NETWORK_AUTHENTICATION_REQUIRED]: defineHTTPError(ErrorCode.NETWORK_AUTHENTICATION_REQUIRED, HTTPStatus.NETWORK_AUTHENTICATION_REQUIRED, {
        summary: "Network authentication required",
        detail: "The client needs to authenticate to gain network access (captive portal).",
        category: ErrorCategory.AUTH,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "Network authentication required.",
        devMessage: "Captive portal authentication needed. User must authenticate with network before accessing resources.",
        suggestions: [
            "Authenticate with captive portal",
            "Check network access requirements",
            "Connect to authenticated network",
        ],
    }),
    [ErrorCode.HTTP_NETWORK_CONNECT_TIMEOUT]: defineHTTPError(ErrorCode.HTTP_NETWORK_CONNECT_TIMEOUT, HTTPStatus.NETWORK_CONNECT_TIMEOUT, {
        summary: "Network connect timeout",
        detail: "Network connection timeout (non-standard, used by some proxies).",
        category: ErrorCategory.TIMEOUT,
        retryable: true,
        severity: ErrorSeverity.ERROR,
        userMessage: "Connection to server timed out.",
        devMessage: "Network connect timeout at proxy/gateway level. Check network connectivity.",
        suggestions: [
            "Retry the request",
            "Check network connectivity",
            "Verify server is accessible",
        ],
    }),
    //
    // ═══ HTTP-specific Transport Errors ═══
    //
    // These errors don't have standard HTTP status codes (use 0 as placeholder)
    [ErrorCode.HTTP_ERROR]: defineHTTPError(ErrorCode.HTTP_ERROR, 0, {
        summary: "HTTP error",
        detail: "A general HTTP error occurred that doesn't fit other categories.",
        category: ErrorCategory.PROTOCOL,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "An HTTP error occurred.",
        devMessage: "Generic HTTP error. Check response details and status code.",
        suggestions: [
            "Check specific HTTP status code",
            "Review error response body",
            "Check server logs for details",
        ],
    }),
    [ErrorCode.INVALID_URL]: defineHTTPError(ErrorCode.INVALID_URL, 0, {
        summary: "Invalid URL",
        detail: "The provided URL is malformed or invalid.",
        category: ErrorCategory.CLIENT,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "Invalid server address.",
        devMessage: "URL parsing failed. Check URL format and components.",
        suggestions: [
            "Verify URL format is correct",
            "Check protocol (http/https)",
            "Verify hostname is valid",
        ],
    }),
    [ErrorCode.INVALID_METHOD]: defineHTTPError(ErrorCode.INVALID_METHOD, 0, {
        summary: "Invalid HTTP method",
        detail: "The HTTP method provided is invalid or malformed.",
        category: ErrorCategory.CLIENT,
        retryable: false,
        severity: ErrorSeverity.ERROR,
        userMessage: "Invalid request method.",
        devMessage: "Invalid HTTP method. Use GET, POST, PUT, PATCH, DELETE, etc.",
        suggestions: [
            "Use standard HTTP methods",
            "Check method spelling",
            "Verify method is supported",
        ],
    }),
};
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
export function httpStatusToErrorCode(status) {
    // Build map from HTTP_STATUS_ERROR_MAP
    const entry = HTTP_STATUS_ERROR_MAP.find(([httpStatus]) => httpStatus === status);
    return entry?.[1] ?? ErrorCode.UNKNOWN;
}
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
export function errorCodeToHTTPStatus(code) {
    // Build map from HTTP_STATUS_ERROR_MAP
    const entry = HTTP_STATUS_ERROR_MAP.find(([, errorCode]) => errorCode === code);
    return entry?.[0] ?? HTTPStatus.INTERNAL_SERVER_ERROR;
}
//# sourceMappingURL=http-errors.js.map