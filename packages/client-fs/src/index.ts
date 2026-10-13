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
