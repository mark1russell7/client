/**
 * The addressing of an HTTP request (roadmap CLI-31): a hook of the request and its body that
 * gives the method and the payload of the call.
 *
 * A URL strategy reads only the request, so a single endpoint with the path in the body was not
 * possible. The addressing reads the body too. The default is `urlAddressing()`: the method from
 * the URL, and the body as the payload. `bodyPathAddressing()` reads the path and the input from
 * the body, for example `POST /api/proc` with `{"path": ["notes", "list"], "input": {}}`.
 *
 * This module imports only the types of `node:http`, so it loads no Node code at run time.
 */

import type { IncomingMessage } from "node:http";
import type { Method } from "../../../client/types.js";
import { pathToMethod } from "../../../server/method.js";
import { topicToSegments } from "../../../procedures/segments.js";
import { createPatternServerUrlStrategy } from "./strategies.js";
import type { NodeUrlStrategy, UrlRequest } from "./handler.js";

/** The address of a call: the method of the procedure and its payload. */
export interface CallAddress {
  /** The method of the procedure. */
  readonly method: Method;
  /** The input of the procedure. An absent payload becomes `{}`. */
  readonly payload?: unknown;
}

/**
 * The addressing of `procedureHandler` and `HttpServerTransport` (CLI-31): a hook of the request
 * and its body that gives the method and the payload of the call. Null: the request names no
 * call, and the handler answers `INVALID_REQUEST`. An error of the hook gives `INVALID_REQUEST`
 * with its message.
 */
export interface Addressing {
  (request: UrlRequest, body: unknown, req: IncomingMessage): CallAddress | null;
  /**
   * True: the handler also takes a request for the base path itself, without a segment after
   * it. A single endpoint with the path in the body needs it, for example `POST /api/proc`.
   * @default false
   */
  readonly takesBasePath?: boolean | undefined;
}

/** The options of `urlAddressing`. */
export interface UrlAddressingOptions {
  /**
   * The path before the method in the URL, for the default URL strategy.
   * @default "/api"
   */
  readonly basePath?: string | undefined;
  /**
   * The method of a request. The default reads the URL format of `HttpTransport`:
   * `{basePath}/{service}/{operation}`.
   */
  readonly urlStrategy?: NodeUrlStrategy | undefined;
}

/** The route parameters that a framework parsed (`req.params` of Express), or none. */
function paramsOf(req: IncomingMessage): Record<string, unknown> {
  const parsed = (req as { params?: unknown }).params;
  return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

/**
 * This function gives the URL addressing, the default of `procedureHandler`: the URL strategy
 * gives the method, and the body is the payload. The `:id` of a RESTful `GET` route of a
 * framework becomes the payload `{ id }`.
 */
export function urlAddressing(options: UrlAddressingOptions = {}): Addressing {
  const strategy = options.urlStrategy ?? createPatternServerUrlStrategy(options.basePath ?? "/api");
  return (request, body, req) => {
    const method = strategy(request, req);
    if (!method) return null;
    const id = paramsOf(req)["id"];
    return { method, payload: req.method === "GET" && typeof id === "string" && id !== "" ? { id } : body };
  };
}

/** The options of `bodyPathAddressing`. */
export interface BodyPathAddressingOptions {
  /**
   * The field of the body with the path of the procedure: a list of segments, or a text with
   * dots between the segments.
   * @default "path"
   */
  readonly pathField?: string | undefined;
  /**
   * The field of the body with the input of the procedure. Without the field, the input is `{}`.
   * @default "input"
   */
  readonly inputField?: string | undefined;
}

/**
 * The segments of a path in a body: a list of raw texts, or one text with dots. Each segment of
 * the text decodes `%2E` to a dot and `%25` to `%` (roadmap CLI-75).
 */
function segmentsOf(value: unknown): string[] | undefined {
  const segments = typeof value === "string" ? topicToSegments(value) : value;
  if (!Array.isArray(segments) || segments.length === 0) return undefined;
  return segments.every((segment): segment is string => typeof segment === "string" && segment !== "") ? segments : undefined;
}

/**
 * This function gives the addressing of a single endpoint with the path in the body (CLI-31), for
 * example `POST /api/proc` with `{"path": ["notes", "list"], "input": {}}`. The handler takes the
 * base path itself too. The function reads only the own fields of the body, so a `__proto__` key
 * cannot give the path. A body without a valid path names no call: the handler answers
 * `INVALID_REQUEST`.
 */
export function bodyPathAddressing(options: BodyPathAddressingOptions = {}): Addressing {
  const pathField = options.pathField ?? "path";
  const inputField = options.inputField ?? "input";
  const addressing = (_request: UrlRequest, body: unknown): CallAddress | null => {
    if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
    const fields = body as Record<string, unknown>;
    const path = segmentsOf(Object.hasOwn(fields, pathField) ? fields[pathField] : undefined);
    if (!path) return null;
    return { method: pathToMethod(path), payload: Object.hasOwn(fields, inputField) ? fields[inputField] : undefined };
  };
  return Object.assign(addressing, { takesBasePath: true });
}
