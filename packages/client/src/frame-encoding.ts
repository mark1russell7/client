/**
 * The encoding of a frame with a shared value (roadmap CLI-112). The publisher of events sends the same event to each
 * subscriber. Each connection puts it in its own frame, with its own id and number. Without this module, each
 * connection encodes the whole event again, so one event costs subscribers x event bytes.
 *
 * The publisher marks an event as shared. `encodeFrame` encodes a marked value once, at its first frame, and puts that
 * text in each later frame. The text of a frame is byte-equal to `JSON.stringify` of the frame.
 *
 * A marked value must not change after its first frame. The publisher marks only the event of the bus, which no
 * subscriber changes.
 */

/** The values that the frames of more than one connection carry. */
const shared = new WeakSet<object>();
/** The JSON text of each shared value, after its first frame. */
const texts = new WeakMap<object, string>();
/** The count of the encodes of shared values, for the tests. */
let encodes = 0;

/**
 * The depth of the frame that `encodeFrame` examines for a shared value. A WebSocket frame and an NDJSON line hold an
 * event at depth 2: the frame, its `payload`, then the `data` of the payload.
 */
const DEPTH = 3;

/** This function marks a value as shared by the frames of more than one connection, and gives the value back. */
export function shareEncoding<T>(value: T): T {
  if (typeof value === "object" && value !== null) shared.add(value);
  return value;
}

/** This function gives the count of the encodes of shared values since the start of the process. */
export function sharedEncodes(): number {
  return encodes;
}

/**
 * This function gives the JSON text of a frame. The function encodes a shared plain object once for all frames. The
 * object can be the frame, or a value in a plain object of the frame up to depth 3. The text is byte-equal to
 * `JSON.stringify(frame)`.
 */
export function encodeFrame(frame: unknown): string {
  const text = encode(frame, DEPTH);
  // `JSON.stringify` gives undefined for a value with no JSON form. A frame is always an object
  if (text === undefined) throw new TypeError("A frame must have a JSON form");
  return text;
}

/** The text of a shared value, from its first encode. */
function sharedText(value: object): string | undefined {
  const known = texts.get(value);
  if (known !== undefined) return known;
  encodes++;
  const text = JSON.stringify(value);
  if (text !== undefined) texts.set(value, text);
  return text;
}

/** True for an object that `JSON.stringify` writes key by key: a plain object with no `toJSON`. */
function isPlain(value: object): value is Record<string, unknown> {
  if (Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) return false;
  return typeof (value as { toJSON?: unknown }).toJSON !== "function";
}

/**
 * The JSON text of the value of a key, as `JSON.stringify` writes it in an object. A `toJSON` method gets the key, as
 * in the object.
 */
function asProperty(key: string, value: unknown): string | undefined {
  const text = JSON.stringify({ [key]: value });
  return text === "{}" ? undefined : text.slice(JSON.stringify(key).length + 2, -1);
}

/** The JSON text of the value of a key, or undefined when the value has no JSON form, as `JSON.stringify` gives. */
function encode(value: unknown, depth: number, key = ""): string | undefined {
  // Only an object and a bigint can have a `toJSON` method
  if (typeof value === "bigint") return asProperty(key, value);
  if (typeof value !== "object" || value === null) return JSON.stringify(value);
  if (!isPlain(value)) return asProperty(key, value);
  if (shared.has(value)) return sharedText(value);
  if (depth === 0) return JSON.stringify(value);
  const parts: string[] = [];
  for (const name of Object.keys(value)) {
    const part = encode(value[name], depth - 1, name);
    if (part !== undefined) parts.push(`${JSON.stringify(name)}:${part}`);
  }
  return `{${parts.join(",")}}`;
}
