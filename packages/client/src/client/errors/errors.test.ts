/**
 * The errors of the client (roadmap R30): the error codes and their registry, the mapping to and
 * from HTTP statuses, the factory functions, the error classes, the helpers that classify an
 * error (`isAvailabilityFailure`, `isNetworkError`, `isNotSentError`), and the forms of an
 * error on the wire.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  ERROR_REGISTRY,
  ErrorCategory,
  ErrorCode,
  ErrorSeverity,
  HTTPStatus,
  createError,
  createErrorFromException,
  createErrorFromHTTPStatus,
  errorCodeToHTTPStatus,
  formatError,
  getErrorMetadata,
  getErrorsByCategory,
  getRetryableErrors,
  httpStatusToErrorCode,
  isErrorCategory,
  isKnownError,
  isRetryable,
  richErrorToStatus,
} from "./index.js";
import { ClientError } from "../types.js";
import { CircuitBreakerError } from "../middleware/circuit-breaker.js";
import { RateLimitError } from "../middleware/rate-limit.js";
import { ValidationError } from "../validation/types.js";
import {
  DELIVERY_METADATA_KEY,
  abortedItem,
  deliveryOf,
  errorItem,
  isAvailabilityFailure,
  isNetworkError,
  isNotSentError,
  retryAfterOf,
  thrownItem,
  withDelivery,
} from "../middleware/items.js";
import { InvocationError } from "../../procedures/invoke.js";
import { HandlerNotFoundError, ServerError } from "../../server/types.js";
import { errorResponse } from "../../server/error-response.js";
import { errorStatus, itemOfFrame } from "../../adapters/websocket/shared/rpc.js";
import { ERROR_CODES, httpStatusOf, isProtocolErrorCode, retryableOf, type ProtocolErrorCode } from "../../protocol.js";

afterEach(() => {
  vi.useRealTimers();
});

/** An error with a code, as Node gives it for a failed socket. */
const withCode = (message: string, code: string): Error => Object.assign(new Error(message), { code });

describe("the error codes and the registry (R30)", () => {
  it("each code of ErrorCode has an entry, and each entry names its own code", () => {
    for (const code of Object.values(ErrorCode)) {
      expect(ERROR_REGISTRY[code], code).toBeDefined();
      expect(ERROR_REGISTRY[code]!.code, code).toBe(code);
    }
    for (const [key, entry] of Object.entries(ERROR_REGISTRY)) expect(entry.code, key).toBe(key);
  });

  it("each entry has its texts, a category and a severity of the enums", () => {
    const categories = new Set<string>(Object.values(ErrorCategory));
    const severities = new Set<string>(Object.values(ErrorSeverity));
    for (const entry of Object.values(ERROR_REGISTRY)) {
      for (const text of [entry.summary, entry.detail, entry.userMessage, entry.devMessage]) expect(text.length, entry.code).toBeGreaterThan(0);
      expect(categories.has(entry.category), entry.code).toBe(true);
      expect(severities.has(entry.severity), entry.code).toBe(true);
      expect(typeof entry.retryable, entry.code).toBe("boolean");
    }
  });

  it("an unknown code gets the UNKNOWN entry", () => {
    expect(getErrorMetadata("NO_SUCH_CODE")).toBe(ERROR_REGISTRY["UNKNOWN"]);
    expect(isKnownError("TIMEOUT")).toBe(true);
    expect(isKnownError("NO_SUCH_CODE")).toBe(false);
  });

  it("selects the entries of a category, and the retryable entries", () => {
    const timeouts = getErrorsByCategory(ErrorCategory.TIMEOUT);
    expect(timeouts.map((entry) => entry.code)).toEqual(expect.arrayContaining(["TIMEOUT", "CONNECTION_TIMEOUT", "GATEWAY_TIMEOUT"]));
    expect(timeouts.every((entry) => entry.category === ErrorCategory.TIMEOUT)).toBe(true);
    const retryable = getRetryableErrors();
    expect(retryable.every((entry) => entry.retryable)).toBe(true);
    expect(retryable.map((entry) => entry.code)).toEqual(expect.arrayContaining(["NETWORK_ERROR", "SERVICE_UNAVAILABLE", "TOO_MANY_REQUESTS"]));
    expect(retryable.map((entry) => entry.code)).not.toContain("ABORTED");
  });

  it("knows the two codes of the HTTP client: a broken stream is retryable, too much metadata is not", () => {
    expect(getErrorMetadata("STREAM_ENDED")).toMatchObject({ code: "STREAM_ENDED", category: ErrorCategory.NETWORK, retryable: true });
    expect(getErrorMetadata("METADATA_TOO_LARGE")).toMatchObject({ code: "METADATA_TOO_LARGE", category: ErrorCategory.CLIENT, retryable: false });
    // The request with too much metadata does not go, so the code has no status
    expect(ERROR_REGISTRY["METADATA_TOO_LARGE"]!.httpStatus).toBeUndefined();
    expect(ERROR_REGISTRY["STREAM_ENDED"]!.httpStatus).toBeUndefined();
  });
});

describe("the HTTP statuses of the codes (R30)", () => {
  it("maps a status to its code, and a code to its status", () => {
    expect(httpStatusToErrorCode(HTTPStatus.NOT_FOUND)).toBe(ErrorCode.NOT_FOUND);
    expect(httpStatusToErrorCode(HTTPStatus.REQUEST_TIMEOUT)).toBe(ErrorCode.TIMEOUT);
    expect(httpStatusToErrorCode(HTTPStatus.INTERNAL_SERVER_ERROR)).toBe(ErrorCode.INTERNAL_ERROR);
    expect(httpStatusToErrorCode(HTTPStatus.TOO_MANY_REQUESTS)).toBe(ErrorCode.TOO_MANY_REQUESTS);
    expect(errorCodeToHTTPStatus(ErrorCode.UNAUTHORIZED)).toBe(401);
    expect(errorCodeToHTTPStatus(ErrorCode.SERVICE_UNAVAILABLE)).toBe(503);
  });

  it("gives UNKNOWN for a status without a code, and 500 for a code without a status", () => {
    expect(httpStatusToErrorCode(299)).toBe(ErrorCode.UNKNOWN);
    expect(httpStatusToErrorCode(200)).toBe(ErrorCode.UNKNOWN);
    expect(errorCodeToHTTPStatus(ErrorCode.NETWORK_ERROR)).toBe(HTTPStatus.INTERNAL_SERVER_ERROR);
  });

  it("each status of the mapping goes to a code and back, or to the status of the protocol for a code of the protocol", () => {
    const statuses = Object.values(HTTPStatus).filter((value): value is number => typeof value === "number" && value >= 400);
    for (const status of statuses) {
      const code = httpStatusToErrorCode(status);
      if (code === ErrorCode.UNKNOWN) continue;
      // A 408 of another server is a TIMEOUT, and the protocol gives TIMEOUT the status 504
      expect(errorCodeToHTTPStatus(code), `${status} -> ${code}`).toBe(httpStatusOf(code) ?? status);
    }
  });

  it("the status of each registry entry outside the protocol maps back to its code", () => {
    for (const entry of Object.values(ERROR_REGISTRY)) {
      if (!entry.httpStatus || isProtocolErrorCode(entry.code)) continue;
      expect(httpStatusToErrorCode(entry.httpStatus), entry.code).toBe(entry.code);
    }
  });
});

describe("the registry and the error codes of the protocol (R25)", () => {
  it("each code of the protocol has an entry with the HTTP status and the retry flag of ERROR_CODES", () => {
    for (const code of Object.keys(ERROR_CODES) as ProtocolErrorCode[]) {
      const entry = ERROR_REGISTRY[code];
      expect(entry, code).toBeDefined();
      expect({ code: entry?.code, http: entry?.httpStatus, retryable: entry?.retryable }, code).toEqual({
        code,
        http: ERROR_CODES[code].http,
        retryable: ERROR_CODES[code].retryable,
      });
    }
  });

  it("errorCodeToHTTPStatus gives the status of the protocol for each code of the protocol", () => {
    for (const code of Object.keys(ERROR_CODES) as ProtocolErrorCode[]) {
      if (!(Object.values(ErrorCode) as string[]).includes(code)) continue;
      expect(errorCodeToHTTPStatus(code as ErrorCode), code).toBe(ERROR_CODES[code].http);
    }
  });

  it("an entry of a protocol code that the registry did not describe has the meaning of the protocol", () => {
    expect(ERROR_REGISTRY["HANDLER_ERROR"]).toMatchObject({ summary: ERROR_CODES.HANDLER_ERROR.meaning, httpStatus: 500, retryable: false });
    expect(getErrorMetadata("UNAVAILABLE")).toMatchObject({ code: "UNAVAILABLE", httpStatus: 503, retryable: true });
  });
});

describe("the factory functions (R30)", () => {
  it("createError gives the registry entry, the context with the time, and the cause only when given", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const error = createError("TIMEOUT", { requestId: "r1", transport: "http" });
    expect(error.code).toBe("TIMEOUT");
    expect(error.metadata).toBe(ERROR_REGISTRY["TIMEOUT"]);
    expect(error.context).toEqual({ timestamp: 1_700_000_000_000, requestId: "r1", transport: "http" });
    expect("cause" in error).toBe(false);
    const cause = new Error("socket");
    expect(createError("NETWORK_ERROR", {}, cause).cause).toBe(cause);
  });

  it("createError keeps an unknown code with the metadata of UNKNOWN", () => {
    const error = createError("MY_CODE");
    expect(error.code).toBe("MY_CODE");
    expect(error.metadata.code).toBe("UNKNOWN");
  });

  it("createErrorFromHTTPStatus gives the code of the status", () => {
    const error = createErrorFromHTTPStatus(503, { requestId: "r2" });
    expect(error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    expect(error.metadata.retryable).toBe(true);
    expect(createErrorFromHTTPStatus(299).code).toBe(ErrorCode.UNKNOWN);
  });

  it("createErrorFromException classifies an error by its name and its message", () => {
    const named = (name: string, message: string): Error => Object.assign(new Error(message), { name });
    const cases: Array<[Error, ErrorCode]> = [
      [named("AbortError", "This operation was aborted"), ErrorCode.ABORTED],
      [new Error("Request timed out after 30s"), ErrorCode.TIMEOUT],
      [new Error("getaddrinfo ENOTFOUND example.invalid"), ErrorCode.DNS_ERROR],
      [new Error("connect ECONNREFUSED 127.0.0.1:1"), ErrorCode.CONNECTION_REFUSED],
      [new TypeError("fetch failed"), ErrorCode.NETWORK_ERROR],
      [new SyntaxError("Unexpected token } in JSON at position 3"), ErrorCode.PARSE_ERROR],
      [new TypeError("Do not know how to serialize a BigInt"), ErrorCode.SERIALIZE_ERROR],
      [new Error("something else"), ErrorCode.UNKNOWN],
    ];
    for (const [error, code] of cases) expect(createErrorFromException(error).code, error.message).toBe(code);
    const cause = new Error("x");
    expect(createErrorFromException(cause, { transport: "ws" })).toMatchObject({ cause, context: { transport: "ws" } });
  });

  it("createErrorFromException gives TIMEOUT for the reason of AbortSignal.timeout(), not ABORTED", async () => {
    const signal = AbortSignal.timeout(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    // A DOMException named TimeoutError: "The operation was aborted due to timeout"
    const reason = signal.reason as Error;
    expect(reason.name).toBe("TimeoutError");
    expect(createErrorFromException(reason).code).toBe(ErrorCode.TIMEOUT);
  });

  it("createErrorFromException gives SERIALIZE_ERROR for a circular structure, not PARSE_ERROR", () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    let thrown: unknown;
    try {
      JSON.stringify(circular);
    } catch (error) {
      thrown = error;
    }
    // "Converting circular structure to JSON": the message names JSON, as a parse error does
    expect(createErrorFromException(thrown as Error).code).toBe(ErrorCode.SERIALIZE_ERROR);
  });

  it("richErrorToStatus gives a status of plain data that survives JSON", () => {
    const status = richErrorToStatus(createError("SERVICE_UNAVAILABLE"));
    expect(status).toMatchObject({ type: "error", code: "SERVICE_UNAVAILABLE", message: "Service unavailable", retryable: true });
    expect(status.metadata).toBe(ERROR_REGISTRY["SERVICE_UNAVAILABLE"]);
    expect(JSON.parse(JSON.stringify(status))).toEqual(status);
  });

  it("formatError gives the code, the facts, the context, the suggestions and the cause", () => {
    const cause = new Error("socket hang up");
    const error = createError(
      "TIMEOUT",
      { requestId: "r3", transport: "http", method: { service: "users", operation: "get", version: "v2" } },
      cause,
    );
    const text = formatError(error);
    expect(text.split("\n").slice(0, 5)).toEqual([
      "[TIMEOUT] Request timed out",
      `  Detail: ${ERROR_REGISTRY["TIMEOUT"]!.detail}`,
      "  Category: timeout",
      // ERROR_CODES of the protocol: a call whose deadline passed is not retryable
      "  Retryable: false",
      "  Severity: warning",
    ]);
    expect(text).toContain("  Request ID: r3");
    expect(text).toContain("  Transport: http");
    expect(text).toContain("  Method: v2:users.get");
    expect(text).toContain("  Suggestions:");
    expect(text).toContain("  Cause: socket hang up");
    expect(text).not.toContain("  Stack:");
    expect(formatError(error, true)).toContain("  Stack: ");
    expect(formatError(createError("ABORTED"))).not.toContain("Request ID");
  });

  it("isRetryable and isErrorCategory read the metadata", () => {
    expect(isRetryable(createError("NETWORK_ERROR"))).toBe(true);
    expect(isRetryable(createError("ABORTED"))).toBe(false);
    expect(isErrorCategory(createError("UNAUTHORIZED"), ErrorCategory.AUTH)).toBe(true);
    expect(isErrorCategory(createError("UNAUTHORIZED"), ErrorCategory.NETWORK)).toBe(false);
  });
});

describe("the error classes (R30)", () => {
  it("ClientError takes its message, code and retryable flag from the status", () => {
    const error = new ClientError({ type: "error", code: "UNAVAILABLE", message: "busy", retryable: true }, "r1");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ClientError");
    expect(error.message).toBe("busy");
    expect(error.code).toBe("UNAVAILABLE");
    expect(error.retryable).toBe(true);
    expect(error.responseId).toBe("r1");
  });

  it("CircuitBreakerError names its state and the last error", () => {
    const open = new CircuitBreakerError("OPEN", new Error("down"));
    expect(open.name).toBe("CircuitBreakerError");
    expect(open.message).toBe("Circuit breaker is OPEN: down");
    expect(open.state).toBe("OPEN");
    expect(new CircuitBreakerError("HALF_OPEN", null).message).toBe("Circuit breaker is HALF_OPEN");
  });

  it("RateLimitError keeps the statistics of the limit", () => {
    const stats = { tokensAvailable: 0, maxTokens: 5, queueSize: 0, totalRequests: 6, rejectedRequests: 1 };
    const error = new RateLimitError("Rate limit exceeded", stats);
    expect(error.name).toBe("RateLimitError");
    expect(error.stats).toBe(stats);
  });

  it("InvocationError has a code, a path and a reason, and is not retryable", () => {
    const error = new InvocationError("FORBIDDEN", "refused", ["a", "b"], "clearance");
    expect(error).toMatchObject({ name: "InvocationError", code: "FORBIDDEN", path: ["a", "b"], reason: "clearance", retryable: false });
  });

  it("ValidationError lists its issues", () => {
    const zodError = { message: "invalid", issues: [{ path: ["user", "name"], message: "Required" }] };
    const error = new ValidationError("bad input", "input", zodError, { service: "s", operation: "o" });
    expect(error.name).toBe("ValidationError");
    expect(error.phase).toBe("input");
    expect(error.details).toContain("user.name: Required");
  });

  it("HandlerNotFoundError names the method, and ServerError has a code and a retryable flag", () => {
    expect(new HandlerNotFoundError({ service: "users", operation: "get", version: "2" }).message).toBe("No handler found for users.get (v2)");
    // CLI-4: the default code is INTERNAL_ERROR of wire v1, not the string "500"
    expect(new ServerError("x")).toMatchObject({ name: "ServerError", code: "INTERNAL_ERROR", retryable: false });
  });
});

describe("the classification of an error (R30)", () => {
  it("isAvailabilityFailure is true for the codes of availability and for network errors", () => {
    for (const code of ["UNAVAILABLE", "TIMEOUT", "SERVER_STOPPED", "SERVICE_UNAVAILABLE", "BAD_GATEWAY", "GATEWAY_TIMEOUT", "NETWORK_ERROR", "CONNECTION_REFUSED", "STREAM_ENDED"]) {
      expect(isAvailabilityFailure({ code }), code).toBe(true);
    }
    expect(isAvailabilityFailure(withCode("reset", "ECONNRESET"))).toBe(true);
    expect(isAvailabilityFailure(new Error("WebSocket connection closed"))).toBe(true);
  });

  it("isAvailabilityFailure is false for an abort, a refusal, a validation error and an error of the handler", () => {
    for (const code of ["ABORTED", "VALIDATION_ERROR", "FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND", "HANDLER_ERROR", "DUPLICATE", "RATE_LIMITED"]) {
      expect(isAvailabilityFailure({ code }), code).toBe(false);
    }
    expect(isAvailabilityFailure(new Error("plain"))).toBe(false);
    expect(isAvailabilityFailure(undefined)).toBe(false);
    expect(isAvailabilityFailure("UNAVAILABLE")).toBe(false);
  });

  it("each retryable code of the protocol is a failure of availability, except RATE_LIMITED", () => {
    // A limit of the host refuses the calls of one key (CLI-40): the service is healthy, so a
    // circuit breaker does not count the refusal, but a retry after the wait can succeed
    expect(ERROR_CODES.RATE_LIMITED).toMatchObject({ http: 429, retryable: true });
    const retryable = (Object.keys(ERROR_CODES) as ProtocolErrorCode[]).filter((code) => ERROR_CODES[code].retryable && code !== "RATE_LIMITED");
    expect(retryable.length).toBeGreaterThan(0);
    for (const code of retryable) expect(isAvailabilityFailure({ code }), code).toBe(true);
  });

  it("isNetworkError reads the code, the cause, a failed fetch and the WebSocket messages", () => {
    expect(isNetworkError(withCode("x", "EPIPE"))).toBe(true);
    expect(isNetworkError(new Error("outer", { cause: withCode("inner", "ECONNRESET") }))).toBe(true);
    expect(isNetworkError(new TypeError("fetch failed"))).toBe(true);
    expect(isNetworkError(new Error("WebSocket disconnected"))).toBe(true);
    expect(isNetworkError(new Error("Connection timeout"))).toBe(true);
    expect(isNetworkError(new Error("Validation failed"))).toBe(false);
    expect(isNetworkError(new CircuitBreakerError("OPEN", null))).toBe(false);
    expect(isNetworkError({ code: "ECONNRESET" })).toBe(false);
    // A cause that is the error itself does not loop
    const loop = new Error("loop");
    (loop as { cause?: unknown }).cause = loop;
    expect(isNetworkError(loop)).toBe(false);
  });

  it("isNotSentError is true only when the request did not leave", () => {
    expect(isNotSentError(withCode("refused", "ECONNREFUSED"))).toBe(true);
    expect(isNotSentError(withCode("dns", "ENOTFOUND"))).toBe(true);
    expect(isNotSentError(new Error("WebSocket disconnected"))).toBe(true);
    expect(isNotSentError(new Error("Connection timeout"))).toBe(true);
    expect(isNotSentError(new Error("x", { cause: withCode("refused", "ECONNREFUSED") }))).toBe(true);
    // A reset or a close during the request: it can have arrived
    expect(isNotSentError(withCode("reset", "ECONNRESET"))).toBe(false);
    expect(isNotSentError(new Error("WebSocket connection closed"))).toBe(false);
    expect(isNotSentError(new Error("Connection timeout after 5s"))).toBe(false);
  });
});

describe("the forms of an error on the wire (R30)", () => {
  it("thrownItem makes an error item: the code, a retryable network error, and its delivery", () => {
    expect(thrownItem("1", withCode("refused", "ECONNREFUSED"))).toEqual({
      id: "1",
      status: { type: "error", code: "ECONNREFUSED", message: "refused", retryable: true },
      payload: null,
      metadata: { [DELIVERY_METADATA_KEY]: "not-sent" },
    });
    expect(thrownItem("2", new Error("bad")).status).toEqual({ type: "error", code: "THROWN", message: "bad", retryable: false });
    expect(deliveryOf(thrownItem("2", new Error("bad")))).toBe("indeterminate");
    expect(thrownItem("3", "a string").status).toMatchObject({ code: "THROWN", message: "a string" });
  });

  it("an error item has a delivery only when a transport marks it", () => {
    const item = errorItem("1", "UNAVAILABLE", "busy", true);
    expect(deliveryOf(item)).toBeUndefined();
    expect(deliveryOf(withDelivery(item, "not-sent"))).toBe("not-sent");
    expect(deliveryOf({ ...item, metadata: { [DELIVERY_METADATA_KEY]: "maybe" } })).toBeUndefined();
    expect(abortedItem("1").status).toEqual({ type: "error", code: "ABORTED", message: "Request was aborted", retryable: false });
  });

  it("retryAfterOf reads a wait of 0 or more milliseconds", () => {
    const item = (value: unknown) => ({ ...errorItem("1", "UNAVAILABLE", "busy", true), metadata: { "retry-after": value } });
    expect(retryAfterOf(item(1500))).toBe(1500);
    expect(retryAfterOf(item(0))).toBe(0);
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, "1500", undefined]) expect(retryAfterOf(item(value)), String(value)).toBeUndefined();
  });

  it("the server keeps the code of an invocation error, its reason, the retryable flag and the wait", () => {
    expect(errorResponse("1", new InvocationError("FORBIDDEN", "no", ["a"], "effects-exceeded"))).toEqual({
      id: "1",
      status: { type: "error", code: "FORBIDDEN", message: "no", retryable: false },
      metadata: { reason: "effects-exceeded" },
    });
    const busy = Object.assign(new Error("busy"), { retryable: true, retryAfterMs: 1500 });
    expect(errorResponse("2", busy)).toEqual({
      id: "2",
      status: { type: "error", code: "HANDLER_ERROR", message: "busy", retryable: true },
      metadata: { "retry-after": 1500 },
    });
    expect(errorResponse("3", Object.assign(new Error("x"), { retryAfterMs: -5, retryable: "yes" })).metadata).toEqual({});
    expect(errorResponse("4", "a string").status).toMatchObject({ code: "HANDLER_ERROR", message: "a string", retryable: false });
    // A handler error keeps its own code, as a stream error does (WIRE-PROTOCOL.md)
    expect(errorResponse("5", Object.assign(new Error("gone"), { code: "E_GONE" })).status).toMatchObject({ code: "E_GONE", message: "gone" });
    expect(errorResponse("6", Object.assign(new Error("x"), { code: 5 })).status).toMatchObject({ code: "HANDLER_ERROR" });
    // An error without a flag gets the flag of its code in ERROR_CODES (CLI-48)
    expect(errorResponse("7", Object.assign(new Error("busy"), { code: "UNAVAILABLE" })).status).toMatchObject({ code: "UNAVAILABLE", retryable: true });
    expect(errorResponse("8", Object.assign(new Error("gone"), { code: "UNAVAILABLE", retryable: false })).status).toMatchObject({ code: "UNAVAILABLE", retryable: false });
  });

  it("a stream error keeps its code and its retryable flag", () => {
    expect(errorStatus(Object.assign(new Error("gone"), { code: "UNAVAILABLE", retryable: true }), 3)).toEqual({
      type: "error",
      code: "UNAVAILABLE",
      message: "gone",
      retryable: true,
    });
    expect(errorStatus("text", 0)).toEqual({ type: "error", code: "HANDLER_ERROR", message: "text", retryable: false });
    expect(errorStatus(Object.assign(new Error("x"), { code: 5, retryable: "no" }), 0)).toMatchObject({ code: "HANDLER_ERROR", retryable: false });
  });

  it("retryableOf: an own flag wins, and without a flag the default of the code before the first item (CLI-68)", () => {
    const busy = Object.assign(new Error("busy"), { code: "UNAVAILABLE" });
    expect(retryableOf(busy, 0)).toBe(true);
    expect(retryableOf(busy, 1)).toBe(false);
    expect(retryableOf(Object.assign(new Error("limit"), { code: "RATE_LIMITED" }), 0)).toBe(true);
    expect(retryableOf(Object.assign(new Error("gone"), { code: "UNAVAILABLE", retryable: false }), 0)).toBe(false);
    expect(retryableOf(Object.assign(new Error("again"), { retryable: true }), 5)).toBe(true);
    // A code outside the table, an error without a code and a value that is not an error: false
    expect(retryableOf(Object.assign(new Error("own"), { code: "E_OWN" }), 0)).toBe(false);
    expect(retryableOf(new Error("plain"), 0)).toBe(false);
    expect(retryableOf("text", 0)).toBe(false);
    expect(retryableOf(null, 0)).toBe(false);
  });

  it("a stream error without a flag gets the flag of its code before the first item, and false after it (CLI-68)", () => {
    const busy = Object.assign(new Error("busy"), { code: "UNAVAILABLE" });
    expect(errorStatus(busy, 0)).toMatchObject({ code: "UNAVAILABLE", retryable: true });
    expect(errorStatus(busy, 1)).toMatchObject({ code: "UNAVAILABLE", retryable: false });
    // An own flag wins before and after the first item
    expect(errorStatus(Object.assign(new Error("gone"), { code: "UNAVAILABLE", retryable: false }), 0)).toMatchObject({ retryable: false });
    expect(errorStatus(Object.assign(new Error("again"), { code: "HANDLER_ERROR", retryable: true }), 2)).toMatchObject({ retryable: true });
    // A code that is not retryable stays not retryable before the first item
    expect(errorStatus(Object.assign(new Error("bad"), { code: "VALIDATION_ERROR" }), 0)).toMatchObject({ retryable: false });
  });

  it("a WebSocket error frame gives an error item, with the status or with the error field", () => {
    const withStatus = itemOfFrame(
      { id: "w", type: "error", status: { type: "error", code: "TIMEOUT", message: "late", retryable: false }, metadata: { reason: "r" } },
      "m",
    );
    expect(withStatus).toEqual({ id: "m", status: { type: "error", code: "TIMEOUT", message: "late", retryable: false }, payload: undefined, metadata: { reason: "r" } });
    // An older frame: only the error field, with a message that is not a string
    const older = itemOfFrame({ id: "w", type: "error", error: { code: "X", message: { detail: 1 } as unknown as string, retryable: true } }, "m");
    expect(older.status).toEqual({ type: "error", code: "X", message: '{"detail":1}', retryable: true });
    expect(itemOfFrame({ id: "w", type: "error" }, "m").status).toEqual({ type: "error", code: "UNKNOWN_ERROR", message: "Unknown error", retryable: false });
    expect(itemOfFrame({ id: "w", type: "response", payload: 7 }, "m")).toMatchObject({ status: { type: "success", code: 200 }, payload: 7 });
  });
});
