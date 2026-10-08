/**
 * Local Transport Types
 *
 * Type definitions and utilities for Local adapter.
 */

import type { Message, Method } from "../../../client/types.js";
import type { ProcedureRegistry } from "../../../procedures/registry.js";

/**
 * Handler function for a method.
 */
export type Handler<TReq = unknown, TRes = unknown> = (
  payload: TReq,
  message: Message<TReq>,
) => TRes | Promise<TRes> | AsyncIterable<TRes>;

/**
 * Method key for handler registry.
 */
export function methodKey(method: Method): string {
  const version = method.version || "";
  return `${version}:${method.service}.${method.operation}`;
}

/**
 * Local Transport configuration.
 */
export interface LocalTransportOptions {
  /**
   * Pre-registered handlers.
   * Keys can be either:
   * - "{service}.{operation}" (e.g., "users.get")
   * - "{version}:{service}.{operation}" (e.g., "v2:users.get")
   */
  handlers?: Record<string, Handler>;

  /**
   * Whether to throw on missing handlers (default: true).
   */
  throwOnMissing?: boolean;

  /**
   * A procedure registry. A method without a registered handler runs the procedure at its path
   * (the service and the operation split on dots: `{ service: "mongo", operation: "documents.find" }`
   * and `{ service: "mongo.documents", operation: "find" }` both give `["mongo", "documents", "find"]`).
   * The procedure runs through `invokeProcedure()`, as on a server.
   */
  registry?: ProcedureRegistry;
}
