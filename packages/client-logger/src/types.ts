/**
 * Client Logger Types
 *
 * Types for the logging procedure interface.
 */

import type { LogLevel, LogOptions } from "@mark1russell7/logger";

// =============================================================================
// Procedure Input Types
// =============================================================================

/**
 * Input for log procedures.
 */
export interface LogInput {
  /** Log message */
  message: string;
  /** Optional context/source */
  context?: string;
  /** Optional structured data */
  data?: Record<string, unknown>;
  /** Optional error (serialized) */
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Input for setLevel procedure.
 */
export interface SetLevelInput {
  /** New log level */
  level: LogLevel;
}

// =============================================================================
// Procedure Output Types
// =============================================================================

/**
 * Output for log procedures.
 */
export interface LogOutput {
  /** Whether the log was written */
  logged: boolean;
}

/**
 * Output for getLevel procedure.
 */
export interface GetLevelOutput {
  /** Current log level */
  level: LogLevel;
  /** Level name */
  levelName: string;
}

// =============================================================================
// Re-exports
// =============================================================================

export { LogLevel, type LogOptions };
