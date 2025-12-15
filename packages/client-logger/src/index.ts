/**
 * client-logger
 *
 * Bridge between client procedures and logger.
 * Enables logging via client.call(["log", "info"], { message: "..." }).
 *
 * @example
 * ```typescript
 * // Using client.call directly
 * import { Client } from "client";
 *
 * const client = new Client(...);
 * await client.call(["log", "info"], { message: "Hello", context: "my-app" });
 * await client.call(["log", "error"], { message: "Oops", error: { name: "Error", message: "..." } });
 *
 * // Using the typed helpers
 * import { logInfo, logError } from "@mark1russell7/client-logger";
 *
 * await logInfo("Hello", { context: "my-app" });
 * await logError("Oops", { error: new Error("...") });
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
  LogInput,
  SetLevelInput,
  LogOutput,
  GetLevelOutput,
} from "./types.js";

export { LogLevel, type LogOptions } from "./types.js";

// =============================================================================
// Registration (for direct import)
// =============================================================================

export { getLogger, setLogger, registerLogProcedures } from "./register.js";

// =============================================================================
// Re-export logger for direct usage
// =============================================================================

export {
  createLogger,
  Logger,
  LOG_LEVEL_NAMES,
  parseLogLevel,
  // Formatters
  SimpleFormatter,
  TimestampedFormatter,
  JsonFormatter,
  createSimpleFormatter,
  createTimestampedFormatter,
  createJsonFormatter,
  // Transports
  ConsoleTransport,
  MemoryTransport,
  CallbackTransport,
  createConsoleTransport,
  createMemoryTransport,
  createCallbackTransport,
} from "@mark1russell7/logger";

export type {
  LogEntry,
  Transport,
  Formatter,
  LoggerOptions,
  ConsoleTransportOptions,
  CallbackTransportOptions,
} from "@mark1russell7/logger";
