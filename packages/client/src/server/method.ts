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
 * This function gives the transport method of a procedure path. The last segment is the
 * operation, and the other segments, joined with dots, are the service. A path of one segment,
 * for example `["morning"]`, has the empty service (CLI-28). An empty path throws.
 */
export function pathToMethod(path: readonly string[]): Method {
  if (path.length === 0) {
    throw new Error("Invalid procedure path: it needs one segment or more");
  }
  return { service: path.slice(0, -1).join("."), operation: path[path.length - 1]! };
}

/**
 * The name of a method with dots: `docker.compose.up`, or only the operation for the empty
 * service of a path of one segment (`morning`).
 */
export function methodName(method: Pick<Method, "service" | "operation">): string {
  return method.service === "" ? method.operation : `${method.service}.${method.operation}`;
}

/**
 * This function gives the procedure path of a transport method. It accepts both encodings:
 * `{ service: "a.b", operation: "c" }` and `{ service: "a", operation: "b.c" }` give `["a", "b", "c"]`.
 */
export function methodToPath(method: Pick<Method, "service" | "operation">): ProcedurePath {
  // The empty service of a path of one segment has no segment. Each other empty segment stays, so
  // a method with ".." or a stray dot names no procedure: the registry has no empty segment (CLI-28)
  const service = method.service === "" ? [] : method.service.split(".");
  return [...service, ...method.operation.split(".")];
}
