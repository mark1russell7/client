/**
 * Universal Server Types
 *
 * Protocol-agnostic server types mirroring the client architecture.
 * Enables handling HTTP, WebSocket, gRPC, etc. with unified RPC format.
 */
/**
 * Handler not found error.
 */
export class HandlerNotFoundError extends Error {
    constructor(method) {
        super(`No handler found for ${method.service}.${method.operation}${method.version ? ` (v${method.version})` : ""}`);
        this.name = "HandlerNotFoundError";
    }
}
/**
 * Server error with status code.
 */
export class ServerError extends Error {
    code;
    retryable;
    constructor(message, code = "500", retryable = false) {
        super(message);
        this.code = code;
        this.retryable = retryable;
        this.name = "ServerError";
    }
}
//# sourceMappingURL=types.js.map