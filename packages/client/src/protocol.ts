/**
 * Wire protocol v1 (roadmap R25). `documentation/WIRE-PROTOCOL.md` specifies the formats.
 *
 * - The version: a WebSocket connection starts with a `hello` frame of each side, and an HTTP
 *   request and its response carry the `Procedures-Protocol` header. A side refuses a newer
 *   version with `PROTOCOL_VERSION`.
 * - One list of error codes for all faces, with the HTTP status of each.
 * - A change after v1 adds only optional fields, or it makes v2.
 */

/** The version of the wire protocol that this package speaks. */
export const PROTOCOL_VERSION = 1;

/** The HTTP header of the protocol version, on a request and on its response. */
export const PROTOCOL_HEADER = "Procedures-Protocol";

/** The facts of one error code. */
export interface ErrorCodeInfo {
  /** The HTTP status of an error with this code. */
  readonly http: number;
  /** True when a retry of the same call can succeed. The error item can say otherwise. */
  readonly retryable: boolean;
  /** What the code means. */
  readonly meaning: string;
}

/** An error code of the protocol. */
export type ProtocolErrorCode =
  | "NOT_FOUND"
  | "NO_HANDLER"
  | "NOT_EXPOSED"
  | "NOT_DECLARED"
  | "FORBIDDEN"
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "INVALID_REQUEST"
  | "PROTOCOL_VERSION"
  | "OUTPUT_VALIDATION_ERROR"
  | "NO_OUTPUT"
  | "HANDLER_ERROR"
  | "INTERNAL_ERROR"
  | "NOT_ACCEPTABLE"
  | "DUPLICATE"
  | "DUPLICATE_REQUEST"
  | "ABORTED"
  | "TIMEOUT"
  | "UNAVAILABLE"
  | "CONNECTION_CLOSED"
  | "CONNECTION_NOT_FOUND"
  | "TOPIC_NOT_FOUND"
  | "TOPIC_CLEARED"
  | "RATE_LIMITED";

/**
 * The error codes of the protocol, on each face (HTTP, WebSocket, MCP, local). An error that a
 * handler throws with its own `code` keeps it, for a value and for a stream (`errorCodeOf`). The
 * HTTP status follows the code: the status of this list, the status of `ERROR_REGISTRY` for
 * another known code, or 500.
 */
export const ERROR_CODES: Readonly<Record<ProtocolErrorCode, ErrorCodeInfo>> = {
  NOT_FOUND: { http: 404, retryable: false, meaning: "No procedure has the path, or the host does not expose it" },
  NO_HANDLER: { http: 404, retryable: false, meaning: "The procedure has no handler here (a stub of a remote host)" },
  NOT_EXPOSED: { http: 403, retryable: false, meaning: "A nested call reached a procedure that the host does not expose" },
  NOT_DECLARED: { http: 403, retryable: false, meaning: "A nested call is not in the calls that the procedure declares" },
  FORBIDDEN: { http: 403, retryable: false, meaning: "The capability of the call refuses it. The metadata key reason tells why" },
  UNAUTHORIZED: { http: 401, retryable: false, meaning: "The request does not present the token of the server" },
  VALIDATION_ERROR: { http: 400, retryable: false, meaning: "The input does not agree with the input schema" },
  INVALID_REQUEST: { http: 400, retryable: false, meaning: "The request is not a valid request of the protocol" },
  PROTOCOL_VERSION: { http: 400, retryable: false, meaning: "The other side speaks a newer version of the protocol" },
  OUTPUT_VALIDATION_ERROR: { http: 500, retryable: false, meaning: "The output does not agree with the output schema" },
  NO_OUTPUT: { http: 500, retryable: false, meaning: "The procedure gave no output" },
  HANDLER_ERROR: { http: 500, retryable: false, meaning: "The handler threw an error without a code" },
  INTERNAL_ERROR: { http: 500, retryable: false, meaning: "The server failed outside the handler" },
  NOT_ACCEPTABLE: { http: 406, retryable: false, meaning: "The face cannot give the output: a stream without an end, without NDJSON" },
  DUPLICATE: { http: 409, retryable: false, meaning: "An idempotency key gave a stream, and a stream cannot be given again" },
  DUPLICATE_REQUEST: { http: 409, retryable: false, meaning: "A request with this id is still running on the connection" },
  ABORTED: { http: 499, retryable: false, meaning: "The caller aborted the call" },
  TIMEOUT: { http: 504, retryable: false, meaning: "The deadline of the call passed" },
  UNAVAILABLE: { http: 503, retryable: true, meaning: "The server cannot take the call now: it stops, or it is busy" },
  CONNECTION_CLOSED: { http: 503, retryable: true, meaning: "The connection closed before the call left" },
  CONNECTION_NOT_FOUND: { http: 404, retryable: false, meaning: "The server has no connection with this id" },
  TOPIC_NOT_FOUND: { http: 404, retryable: false, meaning: "The topic rule of the host has no topic with this name" },
  TOPIC_CLEARED: { http: 410, retryable: false, meaning: "The host cleared a topic of the subscription: clear() of its bus removed the listener" },
  RATE_LIMITED: { http: 429, retryable: true, meaning: "A limit of the host refuses the call. The metadata key retry-after gives the wait, and reason gives the cause" },
};

/** True when a code is an error code of the protocol. */
export function isProtocolErrorCode(code: unknown): code is ProtocolErrorCode {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(ERROR_CODES, code);
}

/**
 * The code of an error that a handler or an invocation throws, on each face: its own code when
 * it is a string, or `HANDLER_ERROR`. An invocation error has a code of this list. Before, a
 * value lost the own code of a handler error, and a stream kept it (roadmap R30).
 */
export function errorCodeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" ? code : "HANDLER_ERROR";
}

/** The HTTP status of an error code, or undefined for a code that is not in the list. */
export function httpStatusOf(code: unknown): number | undefined {
  return isProtocolErrorCode(code) ? ERROR_CODES[code].http : undefined;
}

/**
 * The protocol version that a peer sends, or undefined when it sends none (an older peer, which
 * speaks the formats of v1 without the version).
 */
export function protocolVersionOf(value: unknown): number | undefined {
  const version = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(version) && version > 0 ? version : undefined;
}
