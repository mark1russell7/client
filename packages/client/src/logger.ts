/**
 * The logger port of the server side (CLI-87): the server, the host and each server transport
 * write their log lines to it.
 *
 * The port has the shape of the `Logger` of `@mark1russell7/service`: one method `log(level,
 * message, fields)`. The type is structural, so the engine imports no code of the runner (CLI-5).
 * Thus one object goes to `run({ logger })` of the runner and to `createProcedureHost({ logger })`.
 *
 * - The message tells what occurred. The fields hold the context: the transport, the path, the
 *   request id and the error.
 * - Without a logger, each line goes to the console, with the same method and the same arguments
 *   as before. `CONSOLE_LOGGER` is the console adapter of the port, for the hooks that get a logger.
 */

/** The levels of a log line, from the least to the most severe. They are the levels of the runner. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** The context of a log line: the transport, the path, the request id, the error. */
export type LogFields = Readonly<Record<string, unknown>>;

/**
 * The logger of a server, a host or a server transport. An adapter to another logger is a few
 * lines, for example `{ log: (level, message, fields) => app[level](fields, message) }`.
 */
export interface Logger {
  log(level: LogLevel, message: string, fields: LogFields): void;
}

/** The method of the console for each level: `info` writes with `console.log`. */
const CONSOLE_METHODS = Object.freeze({ debug: "debug", info: "log", warn: "warn", error: "error" } as const);

/**
 * The console adapter of the port. It writes the message and then the fields with the console method
 * of the level: `console.debug`, `console.log`, `console.warn` or `console.error`. It leaves out empty fields.
 */
export const CONSOLE_LOGGER: Logger = Object.freeze({
  log(level: LogLevel, message: string, fields: LogFields): void {
    const method = console[CONSOLE_METHODS[level]];
    if (Object.keys(fields).length > 0) method(message, fields);
    else method(message);
  },
});

/**
 * This function writes one log line. With a logger, the logger gets the level, the message and the
 * fields. Without a logger, the console method of the level gets `consoleArgs`: the line as before.
 * A face of another package uses it too, so its default output stays the same.
 */
export function writeLog(logger: Logger | undefined, level: LogLevel, message: string, fields: LogFields, ...consoleArgs: unknown[]): void {
  if (logger) logger.log(level, message, fields);
  else console[CONSOLE_METHODS[level]](...consoleArgs);
}
