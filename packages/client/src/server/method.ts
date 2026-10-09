/**
 * The one mapping between a procedure path and a transport method.
 *
 * A path `["docker", "compose", "up"]` is the method `{ service: "docker.compose", operation: "up" }`:
 * the last segment is the operation, and the other segments are the service. Before, some hosts
 * sent `{ service: "docker", operation: "compose.up" }` and others the form above, and the
 * server matched methods exactly, so a 3-segment procedure was not found through a warm server
 * (deep dive architecture review 3.3).
 *
 * `methodToPath` splits both the service and the operation on ".", so it reads both forms.
 */

import type { Method } from "../client/types.js";
import type { ProcedurePath } from "../procedures/types.js";

/**
 * This function gives the transport method of a procedure path. A path needs at least two
 * segments, because a method has a service and an operation.
 */
export function pathToMethod(path: readonly string[]): Method {
  if (path.length < 2) {
    throw new Error(`Invalid procedure path (it needs two segments or more): ${path.join(".")}`);
  }
  return { service: path.slice(0, -1).join("."), operation: path[path.length - 1]! };
}

/**
 * This function gives the procedure path of a transport method. It accepts both encodings:
 * `{ service: "a.b", operation: "c" }` and `{ service: "a", operation: "b.c" }` give `["a", "b", "c"]`.
 */
export function methodToPath(method: Pick<Method, "service" | "operation">): ProcedurePath {
  return [...method.service.split("."), ...method.operation.split(".")].filter((segment) => segment !== "");
}
