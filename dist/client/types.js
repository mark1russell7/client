/**
 * Universal Client Type System
 *
 * Protocol-agnostic abstractions for RPC communication.
 * These types work across HTTP, gRPC, WebSocket, and local transports.
 */
/**
 * Client error thrown when response has error status.
 */
export class ClientError extends Error {
    status;
    responseId;
    constructor(status, responseId) {
        super(status.message);
        this.status = status;
        this.responseId = responseId;
        this.name = "ClientError";
    }
    get code() {
        return this.status.code;
    }
    get retryable() {
        return this.status.retryable;
    }
}
//# sourceMappingURL=types.js.map