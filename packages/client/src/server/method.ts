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
 *
 * Each segment encodes `%` as `%25` and then `.` as `%2E` before the join (`encodeSegment()`,
 * roadmap CLI-75). Thus the path `["collections", "e2e.tabs", "find"]` is the method
 * `{ service: "collections.e2e%2Etabs", operation: "find" }`, and `methodToPath` gives the same
 * three segments again. A segment without `.` and `%` stays the same, so a plain path keeps its method.
 */

import type { Method } from "../client/types.js";
import type { ProcedurePath } from "../procedures/types.js";
import { encodeSegment, topicToSegments } from "../procedures/segments.js";

/**
 * This function gives the transport method of a procedure path. The last segment is the
 * operation, and the other segments, joined with dots, are the service. Each segment is encoded
 * first (`encodeSegment()`, roadmap CLI-75). A path of one segment, for example `["morning"]`, has
 * the empty service (CLI-28). An empty path throws.
 *
 * @example
 * ```typescript
 * pathToMethod(["docker", "compose", "up"]); // { service: "docker.compose", operation: "up" }
 * pathToMethod(["collections", "e2e.tabs", "find"]); // { service: "collections.e2e%2Etabs", operation: "find" }
 * ```
 */
export function pathToMethod(path: readonly string[]): Method {
  if (path.length === 0) {
    throw new Error("Invalid procedure path: it needs one segment or more");
  }
  const segments = path.map(encodeSegment);
  return { service: segments.slice(0, -1).join("."), operation: segments[segments.length - 1]! };
}

/**
 * The name of a method with dots: `docker.compose.up`, or only the operation for the empty
 * service of a path of one segment (`morning`). The segments of the method are already encoded,
 * so the name of `["collections", "e2e.tabs", "find"]` is `collections.e2e%2Etabs.find`.
 */
export function methodName(method: Pick<Method, "service" | "operation">): string {
  return method.service === "" ? method.operation : `${method.service}.${method.operation}`;
}

/**
 * This function gives the procedure path of a transport method. It accepts both encodings:
 * `{ service: "a.b", operation: "c" }` and `{ service: "a", operation: "b.c" }` give `["a", "b", "c"]`.
 * It splits on each dot and then decodes each segment (`decodeSegment()`, roadmap CLI-75): `%2E`
 * gives `.` and `%25` gives `%`.
 */
export function methodToPath(method: Pick<Method, "service" | "operation">): ProcedurePath {
  // The empty service of a path of one segment has no segment. Each other empty segment stays, so
  // a method with ".." or a stray dot names no procedure: the registry has no empty segment (CLI-28)
  const service = method.service === "" ? [] : topicToSegments(method.service);
  return [...service, ...topicToSegments(method.operation)];
}
