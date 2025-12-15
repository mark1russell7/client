/**
 * client-logger
 *
 * Bridge between client and logger via procedures.
 * Enables logging via client.call(["log", "info"], { message: "..." }).
 *
 * @example
 * ```typescript
 * import { Client } from "client";
 *
 * const client = new Client(...);
 *
 * // Log via procedure calls
 * await client.call(["log", "info"], { message: "Hello", context: "my-app" });
 * await client.call(["log", "warn"], { message: "Deprecated", context: "api" });
 * await client.call(["log", "error"], {
 *   message: "Request failed",
 *   error: { name: "Error", message: "Connection timeout" }
 * });
 *
 * // Get/set log level
 * const { level, levelName } = await client.call(["log", "getLevel"], undefined);
 * await client.call(["log", "setLevel"], { level: LogLevel.DEBUG });
 * ```
 */
export { LogLevel, LOG_LEVEL_NAMES, parseLogLevel, } from "./types.js";
export type { LogEntry, Transport, Formatter, LoggerOptions, LogOptions, } from "./types.js";
export { getLogger, setLogger, registerLogProcedures, } from "./register.js";
export { createLogger, Logger, SimpleFormatter, TimestampedFormatter, JsonFormatter, createSimpleFormatter, createTimestampedFormatter, createJsonFormatter, ConsoleTransport, MemoryTransport, CallbackTransport, createConsoleTransport, createMemoryTransport, createCallbackTransport, } from "@mark1russell7/logger";
export type { ConsoleTransportOptions, CallbackTransportOptions, } from "@mark1russell7/logger";
//# sourceMappingURL=index.d.ts.map