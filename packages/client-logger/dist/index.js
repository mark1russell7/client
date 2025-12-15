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
// =============================================================================
// Types (re-exported from logger)
// =============================================================================
export { LogLevel, LOG_LEVEL_NAMES, parseLogLevel, } from "./types.js";
// =============================================================================
// Logger Instance & Registration
// =============================================================================
export { getLogger, setLogger, registerLogProcedures, } from "./register.js";
// =============================================================================
// Re-export logger classes for custom setup
// =============================================================================
export { createLogger, Logger, 
// Formatters
SimpleFormatter, TimestampedFormatter, JsonFormatter, createSimpleFormatter, createTimestampedFormatter, createJsonFormatter, 
// Transports
ConsoleTransport, MemoryTransport, CallbackTransport, createConsoleTransport, createMemoryTransport, createCallbackTransport, } from "@mark1russell7/logger";
//# sourceMappingURL=index.js.map