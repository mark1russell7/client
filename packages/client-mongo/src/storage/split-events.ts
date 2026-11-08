/**
 * The change events over the BSON limit of 16 MiB (roadmap CLI-107). An event holds the images of
 * the document before and after its write. Thus a write of a small field can make an event over the
 * limit. The server then fails the read of that event, and a stream that opens again at the same
 * token fails again.
 *
 * - The stage `$changeStreamSplitLargeEvent` (MongoDB 7.0, and 6.0.9 or later) splits such an event
 *   into fragments. Each fragment has its own `_id` and the field `splitEvent: { fragment, of }`.
 *   The stage is the last stage of the pipeline.
 * - `eventJoiner()` joins the fragments of one event into one event. The joined event has the `_id`
 *   of its last fragment, and no field `splitEvent`.
 * - A stream that starts after a fragment gets the fragments after it. The joiner then tells that the
 *   first fragments are missing.
 * - `sameTokenFaults()` counts the errors with one code at one resume token. A fault that stays at one
 *   event comes again at each open. A network error and an error that the driver resumes do not count.
 */
import type { Document } from "mongodb";
import { codeOf } from "./storage-hints.js";

/** The stage that splits a change event over the BSON limit into fragments. It is the last stage of a pipeline. */
export const SPLIT_LARGE_EVENT_STAGE: Readonly<Document> = Object.freeze({ $changeStreamSplitLargeEvent: {} });

/** The code of a server that does not know a stage of the pipeline: a server before 6.0.9 does not know the split stage. */
export const UNKNOWN_STAGE_CODE = 40324;

/** The code of a BSON object over the limit: the server cannot give the event. */
export const OBJECT_TOO_LARGE_CODE = 10334;

/** The count of errors with one code at one token after which the fault does not go away. */
export const SAME_TOKEN_LIMIT = 5;

/**
 * The codes of the errors that a getMore of a change stream gives in an election or a network fault.
 * The driver resumes the stream after these codes, and the server gives them at each token.
 */
const RESUMABLE_CODES: ReadonlySet<number> = new Set([6, 7, 63, 89, 91, 133, 150, 189, 234, 262, 9001, 10107, 11600, 11602, 13388, 13435, 13436]);

/** The result of one event of the stream: a whole event, a fragment that waits for the others, or an event without its first fragments. */
export type JoinResult = { kind: "event"; change: Document } | { kind: "part" } | { kind: "missing"; change: Document; missing: number };

/** The joiner of the fragments of a split event. */
export interface EventJoiner {
  /** This method takes the next event of the stream, and gives the event when it is whole. */
  push(change: Document): JoinResult;
  /** True while fragments of an event wait for the others: the stream is then in the middle of an event. */
  readonly partial: boolean;
}

/** The fragment fields of an event, or undefined for an event that is not split. */
function splitOf(change: Document): { fragment: number; of: number } | undefined {
  const split: unknown = change["splitEvent"];
  if (typeof split !== "object" || split === null) return undefined;
  const { fragment, of } = split as Document;
  return typeof fragment === "number" && typeof of === "number" ? { fragment, of } : undefined;
}

/** This function joins fragments into one event: the fields of each fragment, the `_id` of the last, and no `splitEvent`. */
function joined(parts: readonly Document[]): Document {
  const event: Document = Object.assign({}, ...parts);
  event["_id"] = parts[parts.length - 1]!["_id"];
  delete event["splitEvent"];
  return event;
}

/** This function gives a new joiner. Use one joiner for each stream: a new stream starts with no fragments. */
export function eventJoiner(): EventJoiner {
  let parts: Document[] = [];
  /** The fragments that the stream did not give: the fragments before the first fragment that came. */
  let missing = 0;
  return {
    get partial() {
      return parts.length > 0;
    },
    push(change) {
      const split = splitOf(change);
      if (split === undefined) {
        // An event that is not split ends fragments that wait: the stream cannot give them again
        parts = [];
        missing = 0;
        return { kind: "event", change };
      }
      if (parts.length === 0 || split.fragment !== parts.length + missing + 1) {
        parts = [];
        missing = split.fragment - 1;
      }
      parts.push(change);
      if (split.fragment < split.of) return { kind: "part" };
      const event = joined(parts);
      const lost = missing;
      parts = [];
      missing = 0;
      if (lost > 0) return { kind: "missing", change: { ...event, splitEvent: { missing: lost, of: split.of } }, missing: lost };
      return { kind: "event", change: event };
    },
  };
}

/** True for an error that the server gives at each token in an election or a network fault. */
export function isResumable(error: unknown): boolean {
  const labels = (error as { errorLabels?: unknown } | undefined)?.errorLabels;
  if (Array.isArray(labels) && labels.includes("ResumableChangeStreamError")) return true;
  const code = codeOf(error);
  return code === undefined || RESUMABLE_CODES.has(code);
}

/** The counter of the errors with one code at one token. */
export interface SameTokenFaults {
  /** This method counts an error at a token, and gives the count of errors in a row with its code at that token. A resumable error gives 0. */
  count(error: unknown, token: unknown): number;
  /** This method starts the count again: the stream passed the token. */
  reset(): void;
}

/** This function gives a new counter of the errors with one code at one token. */
export function sameTokenFaults(): SameTokenFaults {
  let key: string | undefined;
  let repeats = 0;
  return {
    count(error, token) {
      if (isResumable(error)) {
        key = undefined;
        repeats = 0;
        return 0;
      }
      const next = `${String(codeOf(error))} ${JSON.stringify(token ?? null)}`;
      repeats = next === key ? repeats + 1 : 1;
      key = next;
      return repeats;
    },
    reset() {
      key = undefined;
      repeats = 0;
    },
  };
}
