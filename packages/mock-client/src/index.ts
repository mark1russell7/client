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
  mockImplementation<TInput, TOutput>(
    path: ProcedurePath,
    impl: (input: TInput) => TOutput | Promise<TOutput>
  ): void;
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
export function createMockClient(options: CreateMockClientOptions = {}): MockClient {
  const { vi } = require("vitest") as typeof import("vitest");
  const { defaultResponse = {}, recordCalls = true } = options;

  const calls: MockCallRecord[] = [];
  const responses = new Map<string, MockResponse>();
  const implementations = new Map<string, (input: unknown) => unknown | Promise<unknown>>();

  const pathToKey = (path: ProcedurePath): string => path.join(".");

  const executeCall = async (path: ProcedurePath, input: unknown): Promise<unknown> => {
    if (recordCalls) {
      calls.push({ path, input, timestamp: Date.now() });
    }
    const key = pathToKey(path);
    const impl = implementations.get(key);
    if (impl) return impl(input);
    const response = responses.get(key) ?? defaultResponse;
    if (response.delay) await new Promise(r => setTimeout(r, response.delay));
    if (response.error) throw response.error;
    return response.output;
  };

  const callMock = vi.fn(executeCall) as MockFn<[ProcedurePath, unknown], Promise<unknown>>;
  const execMock = vi.fn(async (refOrPath: unknown, input?: unknown) => {
    if (Array.isArray(refOrPath)) return executeCall(refOrPath as ProcedurePath, input);
    if (typeof refOrPath === "object" && refOrPath !== null) {
      const ref = refOrPath as { $proc?: ProcedurePath; path?: ProcedurePath; input?: unknown };
      const path = ref.$proc ?? ref.path;
      if (path) return executeCall(path, ref.input ?? input);
    }
    throw new Error("Invalid procedure reference");
  }) as MockFn<[unknown, unknown?], Promise<unknown>>;

  return {
    call: callMock,
    exec: execMock,
    getCalls: () => [...calls],
    getCallsFor: (path: ProcedurePath) => calls.filter(c => pathToKey(c.path) === pathToKey(path)),
    clearCalls: () => { calls.length = 0; },
    mockResponse: <T>(path: ProcedurePath, response: MockResponse<T>) => {
      responses.set(pathToKey(path), response);
    },
    mockImplementation: <TInput, TOutput>(
      path: ProcedurePath,
      impl: (input: TInput) => TOutput | Promise<TOutput>
    ) => {
      implementations.set(pathToKey(path), impl as (input: unknown) => unknown);
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
export function createMockContext(
  options: {
    path?: ProcedurePath | undefined;
    metadata?: Record<string, unknown> | undefined;
    client?: MockClient | undefined;
  } = {}
): MockProcedureContext {
  return {
    metadata: options.metadata ?? {},
    path: options.path ?? ["test", "procedure"],
    client: options.client ?? createMockClient(),
  };
}

export function mockOutput<T>(output: T): MockResponse<T> {
  return { output };
}

export function mockError(error: Error | string): MockResponse {
  return { error: typeof error === "string" ? new Error(error) : error };
}

export function mockDelayed<T>(output: T, delayMs: number): MockResponse<T> {
  return { output, delay: delayMs };
}
