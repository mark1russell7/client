/**
 * @mark1russell7/mock-logger
 *
 * Mock Logger for unit testing.
 */
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["ERROR"] = 0] = "ERROR";
    LogLevel[LogLevel["WARN"] = 1] = "WARN";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 3] = "DEBUG";
    LogLevel[LogLevel["TRACE"] = 4] = "TRACE";
})(LogLevel || (LogLevel = {}));
export const LOG_LEVEL_NAMES = {
    [LogLevel.ERROR]: "ERROR",
    [LogLevel.WARN]: "WARN",
    [LogLevel.INFO]: "INFO",
    [LogLevel.DEBUG]: "DEBUG",
    [LogLevel.TRACE]: "TRACE",
};
export function createMockLogger(options = {}) {
    const { vi } = require("vitest");
    let level = options.level ?? LogLevel.TRACE;
    const defaultContext = options.context;
    const entries = [];
    const captureEntry = (logLevel, message, opts) => {
        if (logLevel > level)
            return;
        const entry = { level: logLevel, message, timestamp: new Date() };
        if (opts?.context !== undefined || defaultContext !== undefined) {
            entry.context = opts?.context ?? defaultContext;
        }
        if (opts?.data !== undefined)
            entry.data = opts.data;
        if (opts?.error !== undefined)
            entry.error = opts.error;
        entries.push(entry);
    };
    const logMock = vi.fn((l, msg, opts) => captureEntry(l, msg, opts));
    const errorMock = vi.fn((msg, opts) => captureEntry(LogLevel.ERROR, msg, opts));
    const warnMock = vi.fn((msg, opts) => captureEntry(LogLevel.WARN, msg, opts));
    const infoMock = vi.fn((msg, opts) => captureEntry(LogLevel.INFO, msg, opts));
    const debugMock = vi.fn((msg, opts) => captureEntry(LogLevel.DEBUG, msg, opts));
    const traceMock = vi.fn((msg, opts) => captureEntry(LogLevel.TRACE, msg, opts));
    const matchMessage = (e, p) => typeof p === "string" ? e.message.includes(p) : p.test(e.message);
    return {
        log: logMock,
        error: errorMock,
        warn: warnMock,
        info: infoMock,
        debug: debugMock,
        trace: traceMock,
        child(ctx) {
            return createMockLogger({ level, context: defaultContext ? defaultContext + ":" + ctx : ctx });
        },
        setLevel(l) { level = l; },
        getLevel() { return level; },
        getEntries() { return [...entries]; },
        getEntriesForLevel(l) { return entries.filter(e => e.level === l); },
        clear() { entries.length = 0; },
        reset() {
            entries.length = 0;
            logMock.mockClear();
            errorMock.mockClear();
            warnMock.mockClear();
            infoMock.mockClear();
            debugMock.mockClear();
            traceMock.mockClear();
        },
        hasLogged(p) { return entries.some(e => matchMessage(e, p)); },
        hasLoggedAtLevel(l, p) { return entries.some(e => e.level === l && matchMessage(e, p)); },
    };
}
//# sourceMappingURL=index.js.map