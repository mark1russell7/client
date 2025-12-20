/**
 * @mark1russell7/mock-logger
 *
 * Mock Logger for unit testing.
 */
export declare enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
    TRACE = 4
}
export declare const LOG_LEVEL_NAMES: Record<LogLevel, string>;
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
    mock: {
        calls: TArgs[];
    };
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
export declare function createMockLogger(options?: CreateMockLoggerOptions): MockLogger;
//# sourceMappingURL=index.d.ts.map