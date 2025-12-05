/**
 * Error Code Enums
 *
 * Comprehensive enum of ALL error codes.
 * NO MAGIC STRINGS - use these enums everywhere!
 */
/**
 * Universal Error Codes
 *
 * Protocol-agnostic error codes that work across all transports.
 */
export var ErrorCode;
(function (ErrorCode) {
    // Network errors
    ErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
    ErrorCode["CONNECTION_REFUSED"] = "CONNECTION_REFUSED";
    ErrorCode["DNS_ERROR"] = "DNS_ERROR";
    // Timeout errors
    ErrorCode["TIMEOUT"] = "TIMEOUT";
    ErrorCode["CONNECTION_TIMEOUT"] = "CONNECTION_TIMEOUT";
    ErrorCode["READ_TIMEOUT"] = "READ_TIMEOUT";
    ErrorCode["DEADLINE_EXCEEDED"] = "DEADLINE_EXCEEDED";
    // Cancellation
    ErrorCode["ABORTED"] = "ABORTED";
    // Protocol/parsing errors
    ErrorCode["PARSE_ERROR"] = "PARSE_ERROR";
    ErrorCode["SERIALIZE_ERROR"] = "SERIALIZE_ERROR";
    ErrorCode["INVALID_RESPONSE"] = "INVALID_RESPONSE";
    ErrorCode["PROTOCOL_ERROR"] = "PROTOCOL_ERROR";
    // Client errors (4xx equivalent)
    ErrorCode["BAD_REQUEST"] = "BAD_REQUEST";
    ErrorCode["UNAUTHORIZED"] = "UNAUTHORIZED";
    ErrorCode["FORBIDDEN"] = "FORBIDDEN";
    ErrorCode["NOT_FOUND"] = "NOT_FOUND";
    ErrorCode["METHOD_NOT_ALLOWED"] = "METHOD_NOT_ALLOWED";
    ErrorCode["NOT_ACCEPTABLE"] = "NOT_ACCEPTABLE";
    ErrorCode["PROXY_AUTHENTICATION_REQUIRED"] = "PROXY_AUTHENTICATION_REQUIRED";
    ErrorCode["CONFLICT"] = "CONFLICT";
    ErrorCode["GONE"] = "GONE";
    ErrorCode["LENGTH_REQUIRED"] = "LENGTH_REQUIRED";
    ErrorCode["PRECONDITION_FAILED"] = "PRECONDITION_FAILED";
    ErrorCode["PAYLOAD_TOO_LARGE"] = "PAYLOAD_TOO_LARGE";
    ErrorCode["URI_TOO_LONG"] = "URI_TOO_LONG";
    ErrorCode["UNSUPPORTED_MEDIA_TYPE"] = "UNSUPPORTED_MEDIA_TYPE";
    ErrorCode["RANGE_NOT_SATISFIABLE"] = "RANGE_NOT_SATISFIABLE";
    ErrorCode["EXPECTATION_FAILED"] = "EXPECTATION_FAILED";
    ErrorCode["IM_A_TEAPOT"] = "IM_A_TEAPOT";
    ErrorCode["MISDIRECTED_REQUEST"] = "MISDIRECTED_REQUEST";
    ErrorCode["UNPROCESSABLE_ENTITY"] = "UNPROCESSABLE_ENTITY";
    ErrorCode["LOCKED"] = "LOCKED";
    ErrorCode["FAILED_DEPENDENCY"] = "FAILED_DEPENDENCY";
    ErrorCode["TOO_EARLY"] = "TOO_EARLY";
    ErrorCode["UPGRADE_REQUIRED"] = "UPGRADE_REQUIRED";
    ErrorCode["PRECONDITION_REQUIRED"] = "PRECONDITION_REQUIRED";
    ErrorCode["TOO_MANY_REQUESTS"] = "TOO_MANY_REQUESTS";
    ErrorCode["REQUEST_HEADER_FIELDS_TOO_LARGE"] = "REQUEST_HEADER_FIELDS_TOO_LARGE";
    ErrorCode["UNAVAILABLE_FOR_LEGAL_REASONS"] = "UNAVAILABLE_FOR_LEGAL_REASONS";
    ErrorCode["CLIENT_CLOSED_REQUEST"] = "CLIENT_CLOSED_REQUEST";
    // Server errors (5xx equivalent)
    ErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
    ErrorCode["NOT_IMPLEMENTED"] = "NOT_IMPLEMENTED";
    ErrorCode["BAD_GATEWAY"] = "BAD_GATEWAY";
    ErrorCode["SERVICE_UNAVAILABLE"] = "SERVICE_UNAVAILABLE";
    ErrorCode["GATEWAY_TIMEOUT"] = "GATEWAY_TIMEOUT";
    ErrorCode["HTTP_VERSION_NOT_SUPPORTED"] = "HTTP_VERSION_NOT_SUPPORTED";
    ErrorCode["VARIANT_ALSO_NEGOTIATES"] = "VARIANT_ALSO_NEGOTIATES";
    ErrorCode["INSUFFICIENT_STORAGE"] = "INSUFFICIENT_STORAGE";
    ErrorCode["LOOP_DETECTED"] = "LOOP_DETECTED";
    ErrorCode["NOT_EXTENDED"] = "NOT_EXTENDED";
    ErrorCode["NETWORK_AUTHENTICATION_REQUIRED"] = "NETWORK_AUTHENTICATION_REQUIRED";
    ErrorCode["HTTP_NETWORK_CONNECT_TIMEOUT"] = "HTTP_NETWORK_CONNECT_TIMEOUT";
    // Configuration errors
    ErrorCode["INVALID_CONFIG"] = "INVALID_CONFIG";
    ErrorCode["INVALID_URL"] = "INVALID_URL";
    ErrorCode["INVALID_METHOD"] = "INVALID_METHOD";
    // HTTP-specific
    ErrorCode["HTTP_ERROR"] = "HTTP_ERROR";
    // Unknown
    ErrorCode["UNKNOWN"] = "UNKNOWN";
})(ErrorCode || (ErrorCode = {}));
//# sourceMappingURL=codes.js.map