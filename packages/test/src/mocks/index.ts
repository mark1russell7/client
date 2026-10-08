/**
 * Re-exports from standalone mock packages
 *
 * The mock implementations live in their own packages:
 * - @mark1russell7/mock-client
 * - @mark1russell7/mock-fs
 * - @mark1russell7/mock-logger
 */

// Re-export mock-client
export {
  createMockClient,
  createMockContext,
  mockOutput,
  mockError,
  mockDelayed,
  type MockClient,
  type MockProcedureContext,
  type MockCallRecord,
  type MockResponse,
  type MockFn,
  type ProcedurePath,
  type CreateMockClientOptions,
} from "@mark1russell7/mock-client";

// Re-export mock-fs
export {
  createMockFs,
  type MockFs,
  type MockFsEntry,
  type CreateMockFsOptions,
} from "@mark1russell7/mock-fs";

// Re-export mock-logger
export {
  createMockLogger,
  LogLevel,
  LOG_LEVEL_NAMES,
  type MockLogger,
  type CapturedLogEntry,
  type LogOptions,
  type CreateMockLoggerOptions,
} from "@mark1russell7/mock-logger";
