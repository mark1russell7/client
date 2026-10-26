/**
 * The metadata of an unbounded stream response (roadmap R15). `ProcedureServer` writes it, and the
 * HTTP server transport reads it. This module has no import, so a transport can use it without an
 * import of the server (invariant I9, roadmap CLI-83).
 */

/**
 * The metadata key of a stream response whose procedure declares `stream: { unbounded: true }`.
 * Its value is "unbounded".
 */
export const STREAM_METADATA_KEY = "stream";

/** True when a stream response can run without an end (roadmap R15). */
export function isUnboundedStream(response: { metadata?: Record<string, unknown> | undefined }): boolean {
  return response.metadata?.[STREAM_METADATA_KEY] === "unbounded";
}
