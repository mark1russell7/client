/**
 * HTTP Strategy Interfaces
 *
 * Defines extensible, bidirectional strategies for URL mapping
 * and HTTP method selection. These strategies ensure client
 * and server use consistent, inverse operations.
 */

import type { Method } from "../../../client/types.js";
import { HTTPMethod } from "./constants.js";

/**
 * URL Strategy (Client-side)
 *
 * Converts Method → URL
 */
export type UrlStrategy = (method: Method, baseUrl: string) => string;

/**
 * URL Parser Strategy (Server-side)
 *
 * Converts URL → Method (inverse of UrlStrategy)
 */
export type UrlParserStrategy = (url: string, httpMethod: HTTPMethod) => Method | null;

/**
 * HTTP Method Strategy (Client-side)
 *
 * Converts Method → HTTP method verb
 */
export type HttpMethodStrategy = (method: Method) => HTTPMethod;

/**
 * HTTP Method Parser Strategy (Server-side)
 *
 * Converts HTTP method verb → operation hints (inverse of HttpMethodStrategy)
 */
export type HttpMethodParserStrategy = (httpMethod: HTTPMethod) => Partial<Method>;

/**
 * Bidirectional URL Pattern
 *
 * Encapsulates both URL generation (client) and parsing (server)
 * to ensure they remain algorithmic inverses.
 */
export interface UrlPattern {
  /** Template pattern (e.g., "/{version?}/{service}/{operation}") */
  readonly template: string;

  /** Generate URL from Method (client-side) */
  format(method: Method, baseUrl: string): string;

  /** Parse URL back to Method (server-side) */
  parse(url: string, httpMethod: HTTPMethod): Method | null;
}

/**
 * Default URL Pattern: /{version?}/{service}/{operation}
 *
 * Examples:
 * - { service: "users", operation: "get" } → "/users/get"
 * - { service: "users", operation: "get", version: "v2" } → "/v2/users/get"
 */
export const defaultUrlPattern: UrlPattern = {
  template: "/{version?}/{service}/{operation}",

  format(method: Method, baseUrl: string): string {
    const parts = [baseUrl.replace(/\/$/, "")];

    if (method.version) {
      parts.push(method.version);
    }

    parts.push(method.service, method.operation);

    return parts.join("/");
  },

  parse(url: string, _httpMethod: HTTPMethod): Method | null {
    // Remove base URL and query params
    const path = url.split("?")[0];
    const segments = path?.split("/").filter(Boolean) ?? [];

    // Minimum: /service/operation (2 segments)
    if (segments.length < 2) {
      return null;
    }

    // Pattern: [version?]/service/operation
    if (segments.length === 2) {
      return {
        service: segments[0]!,
        operation: segments[1]!,
      };
    }

    if (segments.length === 3) {
      return {
        version: segments[0]!,
        service: segments[1]!,
        operation: segments[2]!,
      };
    }

    return null;
  },
};

/**
 * RESTful URL Pattern: /{version?}/{service}/{id?}
 *
 * Infers operation from HTTP method and presence of ID:
 * - GET /users → list
 * - GET /users/123 → get
 * - POST /users → create
 * - PUT /users/123 → update
 * - PATCH /users/123 → patch
 * - DELETE /users/123 → delete
 */
export const restfulUrlPattern: UrlPattern = {
  template: "/{version?}/{service}/{id?}",

  format(method: Method, baseUrl: string): string {
    const parts = [baseUrl.replace(/\/$/, "")];

    if (method.version) {
      parts.push(method.version);
    }

    parts.push(method.service);

    // For RESTful, operation might encode the ID
    // This is simplified - real implementation would need ID extraction
    if (method.operation !== "list" && method.operation !== "create") {
      // Assume operation is actually the ID for get/update/delete
      parts.push(method.operation);
    }

    return parts.join("/");
  },

  parse(url: string, httpMethod: HTTPMethod): Method | null {
    const path = url.split("?")[0];
    const segments = path?.split("/").filter(Boolean) ?? [];

    if (segments.length < 1) {
      return null;
    }

    let version: string | undefined;
    let service: string;
    let id: string | undefined;

    // Pattern: [version?]/service/[id?]
    if (segments.length === 1) {
      service = segments[0]!;
    } else if (segments.length === 2) {
      // Could be version/service or service/id
      // Heuristic: if starts with 'v', treat as version
      if (segments[0]!.startsWith("v")) {
        version = segments[0]!;
        service = segments[1]!;
      } else {
        service = segments[0]!;
        id = segments[1]!;
      }
    } else {
      version = segments[0]!;
      service = segments[1]!;
      id = segments[2]!;
    }

    // Infer operation from HTTP method and ID presence
    const operation = inferRESTOperation(httpMethod, !!id);

    return {
      ...(version && { version }),
      service,
      operation,
      // Store ID in metadata or custom field if needed
    };
  },
};

/**
 * RESTful HTTP Method Strategy
 *
 * Maps operation names to HTTP methods:
 * - get/list/find/watch → GET
 * - create → POST
 * - update → PUT
 * - patch → PATCH
 * - delete/remove → DELETE
 * - default → POST
 */
export const restfulHttpMethodStrategy: HttpMethodStrategy = (method) => {
  const op = method.operation.toLowerCase();

  if (op === "get" || op === "list" || op === "find" || op === "watch") {
    return HTTPMethod.GET;
  }

  if (op === "create") {
    return HTTPMethod.POST;
  }

  if (op === "update") {
    return HTTPMethod.PUT;
  }

  if (op === "patch") {
    return HTTPMethod.PATCH;
  }

  if (op === "delete" || op === "remove") {
    return HTTPMethod.DELETE;
  }

  // Default to POST for RPC-style operations
  return HTTPMethod.POST;
};

/**
 * POST-only HTTP Method Strategy
 *
 * All operations use POST (simple RPC style).
 */
export const postOnlyStrategy: HttpMethodStrategy = () => HTTPMethod.POST;

/**
 * Infer REST operation from HTTP method and ID presence
 */
function inferRESTOperation(httpMethod: HTTPMethod, hasId: boolean): string {
  switch (httpMethod) {
    case HTTPMethod.GET:
      return hasId ? "get" : "list";
    case HTTPMethod.POST:
      return "create";
    case HTTPMethod.PUT:
      return "update";
    case HTTPMethod.PATCH:
      return "patch";
    case HTTPMethod.DELETE:
      return "delete";
    default:
      return "unknown";
  }
}

/**
 * Validate payload can be JSON stringified
 */
export function isValidJSONPayload(payload: unknown): boolean {
  return typeof payload === "object" && payload !== null;
}
