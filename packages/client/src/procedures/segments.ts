/**
 * The one escape of a segment of a procedure path or of a topic (roadmap CLI-75, decision D36).
 *
 * A method name, a registry key and a topic join their segments with ".". Before, a segment with a
 * dot did not come back: `["collections", "e2e.tabs", "find"]` went over the wire as
 * `collections.e2e.tabs.find` and came back as four segments. Now each segment encodes `%` as
 * `%25` and then `.` as `%2E` before the join.
 *
 * - A segment without `.` and `%` encodes to itself. Thus the wire text of each such name stays the same.
 * - The decode changes `%2E` and `%2e` to `.`, and `%25` to `%`. It keeps each other `%` sequence,
 *   so the raw `%` of an old client stays a `%`.
 * - For each segment, `decodeSegment(encodeSegment(segment))` gives the same segment.
 */

/**
 * This function encodes one segment for a text with dots between the segments. It encodes `%` as
 * `%25` and then `.` as `%2E`. A segment without `.` and `%` stays the same.
 *
 * @example
 * ```typescript
 * encodeSegment("notes"); // "notes"
 * encodeSegment("e2e.tabs"); // "e2e%2Etabs"
 * encodeSegment("50%"); // "50%25"
 * ```
 */
export function encodeSegment(segment: string): string {
  return segment.replace(/[%.]/g, (char) => (char === "%" ? "%25" : "%2E"));
}

/**
 * This function decodes one segment of a text with dots between the segments. `%2E` and `%2e`
 * become `.`, and `%25` becomes `%`. Each other `%` sequence stays the same.
 *
 * @example
 * ```typescript
 * decodeSegment("e2e%2Etabs"); // "e2e.tabs"
 * decodeSegment("50%25"); // "50%"
 * decodeSegment("50%"); // "50%"
 * ```
 */
export function decodeSegment(segment: string): string {
  return segment.replace(/%(25|2[Ee])/g, (_sequence, code: string) => (code === "25" ? "%" : "."));
}

/**
 * This function gives the text of a list of raw segments: it encodes each segment and joins them
 * with dots. Use it for a topic, so that a segment with a dot stays one segment.
 * `topicToSegments()` gives the segments again.
 *
 * @example
 * ```typescript
 * segmentsToTopic(["orders", "created"]); // "orders.created"
 * segmentsToTopic(["collections", "e2e.tabs"]); // "collections.e2e%2Etabs"
 * ```
 */
export function segmentsToTopic(segments: readonly string[]): string {
  // A segment that is not a string becomes text as with join(): null and undefined give "" (a
  // caller can check a path that is not valid, for example the compiler)
  return segments.map((segment: unknown) => encodeSegment(segment === null || segment === undefined ? "" : String(segment))).join(".");
}

/**
 * This function gives the raw segments of a text with dots between the segments: it splits the
 * text on each dot and decodes each part. For each list of segments with one segment or more,
 * `topicToSegments(segmentsToTopic(segments))` gives the same list.
 *
 * @example
 * ```typescript
 * topicToSegments("collections.e2e%2Etabs"); // ["collections", "e2e.tabs"]
 * ```
 */
export function topicToSegments(topic: string): string[] {
  return topic.split(".").map(decodeSegment);
}
