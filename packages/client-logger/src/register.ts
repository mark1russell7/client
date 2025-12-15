/**
 * Procedure Registration
 *
 * Registers logging procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { defineProcedure, registerModule } from "client";
import {
  createLogger,
  LogLevel,
  LOG_LEVEL_NAMES,
  type Logger,
} from "@mark1russell7/logger";
import type { LogInput, SetLevelInput, LogOutput, GetLevelOutput } from "./types.js";

// =============================================================================
// Logger Instance
// =============================================================================

// Global logger instance for procedures
let logger: Logger = createLogger({
  level: LogLevel.INFO,
  context: "client",
});

/**
 * Get the logger instance used by procedures.
 */
export function getLogger(): Logger {
  return logger;
}

/**
 * Set the logger instance used by procedures.
 */
export function setLogger(newLogger: Logger): void {
  logger = newLogger;
}

// =============================================================================
// Log Procedures
// =============================================================================

const log = {
  /**
   * Log at DEBUG level.
   */
  debug: defineProcedure<LogInput, LogOutput>({
    metadata: {
      description: "Log at DEBUG level",
    },
    handler: (input) => {
      logger.debug(input.message, {
        context: input.context,
        data: input.data,
        error: input.error ? Object.assign(new Error(input.error.message), input.error) : undefined,
      });
      return { logged: true };
    },
  }),

  /**
   * Log at INFO level.
   */
  info: defineProcedure<LogInput, LogOutput>({
    metadata: {
      description: "Log at INFO level",
    },
    handler: (input) => {
      logger.info(input.message, {
        context: input.context,
        data: input.data,
        error: input.error ? Object.assign(new Error(input.error.message), input.error) : undefined,
      });
      return { logged: true };
    },
  }),

  /**
   * Log at WARN level.
   */
  warn: defineProcedure<LogInput, LogOutput>({
    metadata: {
      description: "Log at WARN level",
    },
    handler: (input) => {
      logger.warn(input.message, {
        context: input.context,
        data: input.data,
        error: input.error ? Object.assign(new Error(input.error.message), input.error) : undefined,
      });
      return { logged: true };
    },
  }),

  /**
   * Log at ERROR level.
   */
  error: defineProcedure<LogInput, LogOutput>({
    metadata: {
      description: "Log at ERROR level",
    },
    handler: (input) => {
      logger.error(input.message, {
        context: input.context,
        data: input.data,
        error: input.error ? Object.assign(new Error(input.error.message), input.error) : undefined,
      });
      return { logged: true };
    },
  }),

  /**
   * Log at TRACE level.
   */
  trace: defineProcedure<LogInput, LogOutput>({
    metadata: {
      description: "Log at TRACE level",
    },
    handler: (input) => {
      logger.trace(input.message, {
        context: input.context,
        data: input.data,
        error: input.error ? Object.assign(new Error(input.error.message), input.error) : undefined,
      });
      return { logged: true };
    },
  }),

  /**
   * Set the log level.
   */
  setLevel: defineProcedure<SetLevelInput, LogOutput>({
    metadata: {
      description: "Set the log level",
    },
    handler: (input) => {
      logger.setLevel(input.level);
      return { logged: true };
    },
  }),

  /**
   * Get the current log level.
   */
  getLevel: defineProcedure<void, GetLevelOutput>({
    metadata: {
      description: "Get the current log level",
    },
    handler: () => {
      const level = logger.getLevel();
      return {
        level,
        levelName: LOG_LEVEL_NAMES[level],
      };
    },
  }),
};

// =============================================================================
// Registration
// =============================================================================

/**
 * Register all logging procedures.
 */
export function registerLogProcedures(): void {
  registerModule(["log"], log);
}

// Auto-register when this module is loaded
registerLogProcedures();
