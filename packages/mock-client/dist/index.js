/**
 * @mark1russell7/mock-client
 *
 * Mock Client for unit testing procedures.
 * Provides a configurable mock that tracks calls and returns preset responses.
 */
/**
 * Create a mock client for testing
 */
export function createMockClient(options = {}) {
    const { vi } = require("vitest");
    const { defaultResponse = {}, recordCalls = true } = options;
    const calls = [];
    const responses = new Map();
    const implementations = new Map();
    const pathToKey = (path) => path.join(".");
    const executeCall = async (path, input) => {
        if (recordCalls) {
            calls.push({ path, input, timestamp: Date.now() });
        }
        const key = pathToKey(path);
        const impl = implementations.get(key);
        if (impl)
            return impl(input);
        const response = responses.get(key) ?? defaultResponse;
        if (response.delay)
            await new Promise(r => setTimeout(r, response.delay));
        if (response.error)
            throw response.error;
        return response.output;
    };
    const callMock = vi.fn(executeCall);
    const execMock = vi.fn(async (refOrPath, input) => {
        if (Array.isArray(refOrPath))
            return executeCall(refOrPath, input);
        if (typeof refOrPath === "object" && refOrPath !== null) {
            const ref = refOrPath;
            const path = ref.$proc ?? ref.path;
            if (path)
                return executeCall(path, ref.input ?? input);
        }
        throw new Error("Invalid procedure reference");
    });
    return {
        call: callMock,
        exec: execMock,
        getCalls: () => [...calls],
        getCallsFor: (path) => calls.filter(c => pathToKey(c.path) === pathToKey(path)),
        clearCalls: () => { calls.length = 0; },
        mockResponse: (path, response) => {
            responses.set(pathToKey(path), response);
        },
        mockImplementation: (path, impl) => {
            implementations.set(pathToKey(path), impl);
        },
        reset: () => {
            calls.length = 0;
            responses.clear();
            implementations.clear();
            callMock.mockClear();
            execMock.mockClear();
        },
    };
}
/**
 * Create a mock procedure context
 */
export function createMockContext(options = {}) {
    return {
        metadata: options.metadata ?? {},
        path: options.path ?? ["test", "procedure"],
        client: options.client ?? createMockClient(),
    };
}
export function mockOutput(output) {
    return { output };
}
export function mockError(error) {
    return { error: typeof error === "string" ? new Error(error) : error };
}
export function mockDelayed(output, delayMs) {
    return { output, delay: delayMs };
}
//# sourceMappingURL=index.js.map