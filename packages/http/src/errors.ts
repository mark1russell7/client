/**
 * The errors of the HTTP procedures that are not a refusal or a stop. A server sends them with
 * the code `HANDLER_ERROR` and the message. `code` tells the kind to a caller in the process.
 */

/** The kinds of `HttpError`. */
export type HttpErrorCode =
  /** The URL is not an `http:` or `https:` URL. */
  | "BAD_URL"
  /** The body of the request is larger than the limit of the module. */
  | "REQUEST_TOO_LARGE"
  /** The body of the response is larger than `maxResponseBytes`. */
  | "RESPONSE_TOO_LARGE"
  /** One NDJSON line is larger than `maxLineBytes`. */
  | "LINE_TOO_LARGE"
  /** One server-sent event is larger than `maxEventBytes`. */
  | "EVENT_TOO_LARGE"
  /** The redirects are more than `maxRedirects`. */
  | "TOO_MANY_REDIRECTS"
  /** The response is a redirect, and the input has `redirect: "error"`. */
  | "REDIRECT"
  /** The status of the response is not in 200 to 299 (`http.json`, `http.ndjson`, `http.sse`). */
  | "HTTP_STATUS"
  /** The body is not JSON, or a line of NDJSON is not JSON. */
  | "BAD_JSON"
  /** The content type of an event stream is not `text/event-stream`. */
  | "BAD_CONTENT_TYPE"
  /** The connection failed: no answer, a reset, a TLS error. */
  | "CONNECTION";

/** An error of an HTTP procedure. */
export class HttpError extends Error {
  override readonly name = "HttpError";

  constructor(
    readonly code: HttpErrorCode,
    message: string,
    /** The status of the response, when the server answered. */
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
