/**
 * @mark1russell7/mock-client
 *
 * Mock Client for unit testing procedures.
 * Provides a configurable mock that tracks calls and returns preset responses.
 */
/**
 * Procedure path type
 */
export type ProcedurePath = readonly string[];
/**
 * Mock function type (vitest-compatible)
 */
export interface MockFn<TArgs extends unknown[] = unknown[], TReturn = unknown> {
    (...args: TArgs): TReturn;
    mockClear(): void;
    mock: {
        calls: TArgs[];
    };
}
/**
 * Mock call record
 */
export interface MockCallRecord {
    path: ProcedurePath;
    input: unknown;
    timestamp: number;
}
/**
 * Mock response configuration
 */
export interface MockResponse<T = unknown> {
    output?: T | undefined;
    error?: Error | undefined;
    delay?: number | undefined;
}
/**
 * Mock Client interface matching the real Client's procedure execution
 */
export interface MockClient {
    call: MockFn<[ProcedurePath, unknown], Promise<unknown>>;
    exec: MockFn<[unknown, unknown?], Promise<unknown>>;
    getCalls(): MockCallRecord[];
    getCallsFor(path: ProcedurePath): MockCallRecord[];
    clearCalls(): void;
    mockResponse<T>(path: ProcedurePath, response: MockResponse<T>): void;
    mockImplementation<TInput, TOutput>(path: ProcedurePath, impl: (input: TInput) => TOutput | Promise<TOutput>): void;
    reset(): void;
}
/**
 * Options for creating a mock client
 */
export interface CreateMockClientOptions {
    defaultResponse?: MockResponse | undefined;
    recordCalls?: boolean | undefined;
}
/**
 * Create a mock client for testing
 */
export declare function createMockClient(options?: CreateMockClientOptions): MockClient;
/**
 * Mock ProcedureContext for unit testing procedure handlers
 */
export interface MockProcedureContext {
    metadata: Record<string, unknown>;
    path: ProcedurePath;
    client: MockClient;
    signal?: AbortSignal | undefined;
}
/**
 * Create a mock procedure context
 */
export declare function createMockContext(options?: {
    path?: ProcedurePath | undefined;
    metadata?: Record<string, unknown> | undefined;
    client?: MockClient | undefined;
}): MockProcedureContext;
export declare function mockOutput<T>(output: T): MockResponse<T>;
export declare function mockError(error: Error | string): MockResponse;
export declare function mockDelayed<T>(output: T, delayMs: number): MockResponse<T>;
//# sourceMappingURL=index.d.ts.map