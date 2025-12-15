/**
 * Procedure Registration
 *
 * Registers logging procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { createProcedure, registerProcedures } from "client";
import {
  createLogger,
  LogLevel,
  LOG_LEVEL_NAMES,
  type Logger,
} from "@mark1russell7/logger";

// =============================================================================
// Logger Instance
// =============================================================================

let logger: Logger = createLogger({
  level: LogLevel.INFO,
  context: "client",
});

export function getLogger(): Logger {
  return logger;
}

export function setLogger(newLogger: Logger): void {
  logger = newLogger;
}

// =============================================================================
// Minimal Schema Helpers (Zod-like interface for procedure system)
// =============================================================================

interface ZodLikeSchema<T> {
  parse(data: unknown): T;
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: Error };
  _output: T;
}

function schema<T>(): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => data as T,
    safeParse: (data: unknown) => ({ success: true as const, data: data as T }),
    _output: undefined as unknown as T,
  };
}

// =============================================================================
// Input/Output Types
// =============================================================================

interface LogInput {
  message: string;
  context?: string;
  data?: Record<string, unknown>;
  error?: { name: string; message: string; stack?: string };
}

interface LogOutput {
  logged: boolean;
}

interface SetLevelInput {
  level: LogLevel;
}

interface GetLevelOutput {
  level: LogLevel;
  levelName: string;
}

// =============================================================================
// Schemas
// =============================================================================

const logInputSchema = schema<LogInput>();
const logOutputSchema = schema<LogOutput>();
const setLevelInputSchema = schema<SetLevelInput>();
const getLevelOutputSchema = schema<GetLevelOutput>();
const voidSchema = schema<void>();

// =============================================================================
// Procedure Definitions
// =============================================================================

const debugProcedure = createProcedure()
  .path(["log", "debug"])
  .input(logInputSchema)
  .output(logOutputSchema)
  .meta({ description: "Log at DEBUG level" })
  .handler((input: LogInput) => {
    logger.debug(input.message, {
      context: input.context,
      data: input.data,
      error: input.error ? Object.assign(new Error(input.error.message), input.error) : undefined,
    });
    return { logged: true };
  })
  .build();

const infoProcedure = createProcedure()
  .path(["log", "info"])
  .input(logInputSchema)
  .output(logOutputSchema)
  .meta({ description: "Log at INFO level" })
  .handler((input: LogInput) => {
    logger.info(input.message, {
      context: input.context,
      data: input.data,
      error: input.error ? Object.assign(new Error(input.error.message), input.error) : undefined,
    });
    return { logged: true };
  })
  .build();

const warnProcedure = createProcedure()
  .path(["log", "warn"])
  .input(logInputSchema)
  .output(logOutputSchema)
  .meta({ description: "Log at WARN level" })
  .handler((input: LogInput) => {
    logger.warn(input.message, {
      context: input.context,
      data: input.data,
      error: input.error ? Object.assign(new Error(input.error.message), input.error) : undefined,
    });
    return { logged: true };
  })
  .build();

const errorProcedure = createProcedure()
  .path(["log", "error"])
  .input(logInputSchema)
  .output(logOutputSchema)
  .meta({ description: "Log at ERROR level" })
  .handler((input: LogInput) => {
    logger.error(input.message, {
      context: input.context,
      data: input.data,
      error: input.error ? Object.assign(new Error(input.error.message), input.error) : undefined,
    });
    return { logged: true };
  })
  .build();

const traceProcedure = createProcedure()
  .path(["log", "trace"])
  .input(logInputSchema)
  .output(logOutputSchema)
  .meta({ description: "Log at TRACE level" })
  .handler((input: LogInput) => {
    logger.trace(input.message, {
      context: input.context,
      data: input.data,
      error: input.error ? Object.assign(new Error(input.error.message), input.error) : undefined,
    });
    return { logged: true };
  })
  .build();

const setLevelProcedure = createProcedure()
  .path(["log", "setLevel"])
  .input(setLevelInputSchema)
  .output(logOutputSchema)
  .meta({ description: "Set the log level" })
  .handler((input: SetLevelInput) => {
    logger.setLevel(input.level);
    return { logged: true };
  })
  .build();

const getLevelProcedure = createProcedure()
  .path(["log", "getLevel"])
  .input(voidSchema)
  .output(getLevelOutputSchema)
  .meta({ description: "Get the current log level" })
  .handler(() => {
    const level = logger.getLevel();
    return {
      level,
      levelName: LOG_LEVEL_NAMES[level],
    };
  })
  .build();

// =============================================================================
// Registration
// =============================================================================

export function registerLogProcedures(): void {
  registerProcedures([
    debugProcedure,
    infoProcedure,
    warnProcedure,
    errorProcedure,
    traceProcedure,
    setLevelProcedure,
    getLevelProcedure,
  ]);
}

// Auto-register when this module is loaded
registerLogProcedures();
