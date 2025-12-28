/**
 * @mark1russell7/server-mongo
 *
 * @deprecated Use @mark1russell7/server with --procedures @mark1russell7/client-mongo/register instead.
 *
 * Runnable MongoDB server exposing mongo procedures via client-server peering.
 */
export { config, loadConfig } from "./config.js";
// Re-export server procedures for programmatic usage
export { serverMongoStart, serverMongoStop, serverMongoStatus, serverMongoConnect, } from "@mark1russell7/client-server-mongo";
//# sourceMappingURL=index.js.map