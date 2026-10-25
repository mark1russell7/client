/**
 * Client-FS - Filesystem operations as RPC procedures
 *
 * Provides fs.read, fs.write, fs.exists, and other filesystem procedures.
 *
 * @example
 * ```typescript
 * import { fsProcedures } from "@procedures/fs";
 *
 * // Or use via client.call
 * await client.call(["fs", "read"], { path: "./file.txt" });
 * await client.call(["fs", "write"], { path: "./out.txt", content: "hello" });
 * ```
 */

export * from "./procedures/fs.js";
export * from "./module.js";
// The root that confines each path (roadmap R33)
export { OUTSIDE_ROOT, isInside, isOutsideRoot } from "./root.js";
// The file helpers: atomic write, NDJSON tail heal, keyed lock, serialized edit (roadmap O51)
export * from "./files/index.js";
