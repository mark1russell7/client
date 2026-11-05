/**
 * The cases of the bench of the live limits (roadmap CLI-101). Each case reads one limit of the live state at its
 * edge. The limits are the keys of a topic, the bytes of a value and the topics of a state.
 *
 * - `heap-<bytes>`: one topic with 1,024 keys, each with a value of the given JSON bytes. The record gives the heap
 *   of each key.
 * - `heap-16x16384`: 16 full topics, so the heap of a key is read at a larger heap too.
 * - `topics-4096`: 4,096 topics with one key of 256 bytes each. The record gives the heap of each topic.
 * - `set-<bytes>` and `set-wide`: the time of one call of `live.set`. The value of `set-wide` has 3-byte characters
 *   up to the byte limit.
 * - `snapshot-full`: the call of `live.snapshot` on a full topic, and the JSON of its output.
 * - `window-s<n>`: one window event of a full topic, delivered to n subscribers with a JSON frame for each.
 */

/** The ids of the cases. */
export const LIMITS_CASES: readonly string[] = [
  "heap-256",
  "heap-16384",
  "heap-16x16384",
  "topics-4096",
  "set-256",
  "set-16384",
  "set-wide",
  "snapshot-full",
  "window-s1",
  "window-s10",
];

/** The default limits of the live state, as the bench reads them. */
export const KEYS = 1024;
export const VALUE_BYTES = 16384;
export const TOPICS = 4096;

/** A case of the bench. */
export type LimitsCase =
  | { readonly kind: "heap"; readonly topics: number; readonly bytes: number }
  | { readonly kind: "topics"; readonly topics: number }
  | { readonly kind: "set"; readonly bytes: number; readonly wide: boolean }
  | { readonly kind: "snapshot" }
  | { readonly kind: "window"; readonly subscribers: number };

/** This function reads a case from its id. */
export function parseCase(id: string): LimitsCase {
  const heap = /^heap-(?:(\d+)x)?(\d+)$/.exec(id);
  if (heap) return { kind: "heap", topics: Number(heap[1] ?? 1), bytes: Number(heap[2]) };
  const topics = /^topics-(\d+)$/.exec(id);
  if (topics) return { kind: "topics", topics: Number(topics[1]) };
  if (id === "set-wide") return { kind: "set", bytes: VALUE_BYTES, wide: true };
  const set = /^set-(\d+)$/.exec(id);
  if (set) return { kind: "set", bytes: Number(set[1]), wide: false };
  if (id === "snapshot-full") return { kind: "snapshot" };
  const window = /^window-s(\d+)$/.exec(id);
  if (window) return { kind: "window", subscribers: Number(window[1]) };
  throw new RangeError(`no case ${id}`);
}

/**
 * This function gives the JSON text of a value `{"t": "..."}` with the given bytes at most, unique for `id`. A value
 * with `wide` has the 3-byte character U+20AC. The text goes through `JSON.parse`, as a value from the wire does, so
 * each value has its own flat string.
 */
export function valueText(bytes: number, id: number, wide = false): string {
  const tag = id.toString(36).padStart(4, "0");
  // `{"t":"` and `"}` are 8 bytes
  const room = bytes - 8 - tag.length;
  if (room < 0) throw new RangeError(`a value of ${bytes} bytes has no room for its id`);
  const fill = wide ? "€".repeat(Math.floor(room / 3)) : "x".repeat(room);
  return `{"t":"${tag}${fill}"}`;
}
