/**
 * Procedure Registration
 *
 * Registers logging procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */
import { createProcedure, registerProcedures } from "client";
import { createLogger, LogLevel, LOG_LEVEL_NAMES, } from "@mark1russell7/logger";
// =============================================================================
// Logger Instance
// =============================================================================
let logger = createLogger({
    level: LogLevel.INFO,
    context: "client",
});
export function getLogger() {
    return logger;
}
export function setLogger(newLogger) {
    logger = newLogger;
}
function schema() {
    return {
        parse: (data) => data,
        safeParse: (data) => ({ success: true, data: data }),
        _output: undefined,
    };
}
/**
 * Build log options, excluding undefined values for exactOptionalPropertyTypes.
 */
function buildLogOptions(input) {
    const opts = {};
    if (input.context !== undefined)
        opts.context = input.context;
    if (input.data !== undefined)
        opts.data = input.data;
    if (input.error !== undefined)
        opts.error = Object.assign(new Error(input.error.message), input.error);
    return opts;
}
// =============================================================================
// Schemas
// =============================================================================
const logInputSchema = schema();
const logOutputSchema = schema();
const setLevelInputSchema = schema();
const getLevelOutputSchema = schema();
const voidSchema = schema();
// =============================================================================
// Procedure Definitions
// =============================================================================
const debugProcedure = createProcedure()
    .path(["log", "debug"])
    .input(logInputSchema)
    .output(logOutputSchema)
    .meta({ description: "Log at DEBUG level" })
    .handler((input) => {
    logger.debug(input.message, buildLogOptions(input));
    return { logged: true };
})
    .build();
const infoProcedure = createProcedure()
    .path(["log", "info"])
    .input(logInputSchema)
    .output(logOutputSchema)
    .meta({ description: "Log at INFO level" })
    .handler((input) => {
    logger.info(input.message, buildLogOptions(input));
    return { logged: true };
})
    .build();
const warnProcedure = createProcedure()
    .path(["log", "warn"])
    .input(logInputSchema)
    .output(logOutputSchema)
    .meta({ description: "Log at WARN level" })
    .handler((input) => {
    logger.warn(input.message, buildLogOptions(input));
    return { logged: true };
})
    .build();
const errorProcedure = createProcedure()
    .path(["log", "error"])
    .input(logInputSchema)
    .output(logOutputSchema)
    .meta({ description: "Log at ERROR level" })
    .handler((input) => {
    logger.error(input.message, buildLogOptions(input));
    return { logged: true };
})
    .build();
const traceProcedure = createProcedure()
    .path(["log", "trace"])
    .input(logInputSchema)
    .output(logOutputSchema)
    .meta({ description: "Log at TRACE level" })
    .handler((input) => {
    logger.trace(input.message, buildLogOptions(input));
    return { logged: true };
})
    .build();
const setLevelProcedure = createProcedure()
    .path(["log", "setLevel"])
    .input(setLevelInputSchema)
    .output(logOutputSchema)
    .meta({ description: "Set the log level" })
    .handler((input) => {
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
export function registerLogProcedures() {
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
//# sourceMappingURL=register.js.map