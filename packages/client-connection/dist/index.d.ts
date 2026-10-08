/**
 * Client-Connection - Connection management procedures for bidirectional RPC
 *
 * Provides connection.list, connection.call, connection.broadcast, and pub/sub procedures.
 *
 * @example
 * ```typescript
 * import { connectionManager } from "@mark1russell7/client-connection";
 *
 * // Or use via client.call
 * await client.call(["connection", "list"], {});
 * await client.call(["connection", "call"], { clientId: "abc", path: ["render"], input: data });
 * ```
 */
export * from "./procedures/connection/index.js";
export * from "./register.js";
export * from "./types.js";
export { connectionManager, getConnectionManager, type TrackedConnection } from "./manager.js";
//# sourceMappingURL=index.d.ts.map