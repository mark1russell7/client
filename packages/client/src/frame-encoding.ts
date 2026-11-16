/**
 * The encoding of a frame with a shared value (roadmap CLI-112). The publisher of events sends the same event to each
 * subscriber. Each connection puts it in its own frame, with its own id and number. Without this module, each
 * connection encodes the whole event again, so one event costs subscribers x event bytes.
 *
 * The publisher marks the data of an event as shared, once for each receiver of the event. `encodeFrame` encodes a
 * marked value once, at its first frame, and puts that text in each later frame of the same event. The text of a frame
 * is byte-equal to `JSON.stringify` of the frame at that first encode.
 *
 * A source can publish the same object again after a change. The publisher gives the mark of each emit of the bus.
 * Another mark starts a new event, so the next frame encodes the object again. Without a mark, a receiver that gets
 * the object a second time starts a new event. The text of one event is the value at its first encode.
 */

/** One event of a shared value: the receivers that got it, the mark of its emit, and its text after the first frame. */
interface Share {
  readonly receivers: WeakSet<object>;
  readonly emission: object | undefined;
  text?: string;
}

/** The current event of each shared value. */
const shares = new WeakMap<object, Share>();
/** The count of the encodes of shared values, for the tests. */
let encodes = 0;

/**
 * The depth of the frame that `encodeFrame` examines for a shared value. A WebSocket frame and an NDJSON line hold an
 * event at depth 2: the frame, its `payload`, then the `data` of the payload.
 */
const DEPTH = 3;

/**
 * This function marks a value as shared by the frames of the receivers of one event, and gives the value back. The
 * value starts a new event when the mark of its emit is another mark, or when the receiver got the value before. The
 * first frame of a new event encodes the value again. Before the mark, a receiver that joined after an emit got the
 * text of that emit for a later emit of the changed object (audit 2026-11-08).
 */
export function shareEncoding<T>(value: T, receiver: object, emission?: object): T {
  if (typeof value !== "object" || value === null) return value;
  const share = shares.get(value);
  if (share === undefined || share.receivers.has(receiver) || share.emission !== emission) {
    shares.set(value, { receivers: new WeakSet([receiver]), emission });
  } else {
    share.receivers.add(receiver);
  }
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

/** The text of a shared value, from the first encode of its current event. */
function sharedText(value: object, share: Share): string | undefined {
  if (share.text !== undefined) return share.text;
  encodes++;
  const text = JSON.stringify(value);
  if (text !== undefined) share.text = text;
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
  const share = shares.get(value);
  if (share !== undefined) return sharedText(value, share);
  if (depth === 0) return JSON.stringify(value);
  const parts: string[] = [];
  for (const name of Object.keys(value)) {
    const part = encode(value[name], depth - 1, name);
    if (part !== undefined) parts.push(`${JSON.stringify(name)}:${part}`);
  }
  return `{${parts.join(",")}}`;
}
