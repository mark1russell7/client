/**
 * @mark1russell7/mock-logger
 *
 * Mock Logger for unit testing.
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}

export const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.ERROR]: "ERROR",
  [LogLevel.WARN]: "WARN",
  [LogLevel.INFO]: "INFO",
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.TRACE]: "TRACE",
};

export interface CapturedLogEntry {
  level: LogLevel;
  message: string;
  context?: string | undefined;
  timestamp: Date;
  data?: Record<string, unknown> | undefined;
  error?: Error | undefined;
}

export interface LogOptions {
  context?: string | undefined;
  data?: Record<string, unknown> | undefined;
  error?: Error | undefined;
}

export interface MockFn<TArgs extends unknown[] = unknown[], TReturn = void> {
  (...args: TArgs): TReturn;
  mockClear(): void;
  mock: { calls: TArgs[] };
}

export interface MockLogger {
  log: MockFn<[LogLevel, string, LogOptions?], void>;
  error: MockFn<[string, LogOptions?], void>;
  warn: MockFn<[string, LogOptions?], void>;
  info: MockFn<[string, LogOptions?], void>;
  debug: MockFn<[string, LogOptions?], void>;
  trace: MockFn<[string, LogOptions?], void>;
  child(context: string): MockLogger;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
  getEntries(): CapturedLogEntry[];
  getEntriesForLevel(level: LogLevel): CapturedLogEntry[];
  clear(): void;
  reset(): void;
  hasLogged(message: string | RegExp): boolean;
  hasLoggedAtLevel(level: LogLevel, message: string | RegExp): boolean;
}

export interface CreateMockLoggerOptions {
  level?: LogLevel | undefined;
  context?: string | undefined;
}

export function createMockLogger(options: CreateMockLoggerOptions = {}): MockLogger {
  const { vi } = require("vitest") as typeof import("vitest");
  let level = options.level ?? LogLevel.TRACE;
  const defaultContext = options.context;
  const entries: CapturedLogEntry[] = [];

  const captureEntry = (logLevel: LogLevel, message: string, opts?: LogOptions): void => {
    if (logLevel > level) return;
    const entry: CapturedLogEntry = { level: logLevel, message, timestamp: new Date() };
    if (opts?.context !== undefined || defaultContext !== undefined) {
      entry.context = opts?.context ?? defaultContext;
    }
    if (opts?.data !== undefined) entry.data = opts.data;
    if (opts?.error !== undefined) entry.error = opts.error;
    entries.push(entry);
  };

  const logMock = vi.fn((l: LogLevel, msg: string, opts?: LogOptions) => captureEntry(l, msg, opts)) as MockFn<[LogLevel, string, LogOptions?], void>;
  const errorMock = vi.fn((msg: string, opts?: LogOptions) => captureEntry(LogLevel.ERROR, msg, opts)) as MockFn<[string, LogOptions?], void>;
  const warnMock = vi.fn((msg: string, opts?: LogOptions) => captureEntry(LogLevel.WARN, msg, opts)) as MockFn<[string, LogOptions?], void>;
  const infoMock = vi.fn((msg: string, opts?: LogOptions) => captureEntry(LogLevel.INFO, msg, opts)) as MockFn<[string, LogOptions?], void>;
  const debugMock = vi.fn((msg: string, opts?: LogOptions) => captureEntry(LogLevel.DEBUG, msg, opts)) as MockFn<[string, LogOptions?], void>;
  const traceMock = vi.fn((msg: string, opts?: LogOptions) => captureEntry(LogLevel.TRACE, msg, opts)) as MockFn<[string, LogOptions?], void>;

  const matchMessage = (e: CapturedLogEntry, p: string | RegExp): boolean => 
    typeof p === "string" ? e.message.includes(p) : p.test(e.message);

  return {
    log: logMock,
    error: errorMock,
    warn: warnMock,
    info: infoMock,
    debug: debugMock,
    trace: traceMock,
    child(ctx: string): MockLogger {
      return createMockLogger({ level, context: defaultContext ? defaultContext + ":" + ctx : ctx });
    },
    setLevel(l: LogLevel): void { level = l; },
    getLevel(): LogLevel { return level; },
    getEntries(): CapturedLogEntry[] { return [...entries]; },
    getEntriesForLevel(l: LogLevel): CapturedLogEntry[] { return entries.filter(e => e.level === l); },
    clear(): void { entries.length = 0; },
    reset(): void {
      entries.length = 0;
      logMock.mockClear();
      errorMock.mockClear();
      warnMock.mockClear();
      infoMock.mockClear();
      debugMock.mockClear();
      traceMock.mockClear();
    },
    hasLogged(p: string | RegExp): boolean { return entries.some(e => matchMessage(e, p)); },
    hasLoggedAtLevel(l: LogLevel, p: string | RegExp): boolean { return entries.some(e => e.level === l && matchMessage(e, p)); },
  };
}
