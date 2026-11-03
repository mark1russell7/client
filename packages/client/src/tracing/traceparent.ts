/**
 * The W3C trace context (roadmap R16): `traceparent` is `00-<trace id>-<span id>-<flags>`, with a
 * trace id of 32 hex digits and a span id of 16. The tracing middleware of a client sends it in
 * the metadata of a call (and HTTP as the `traceparent` header). The tracing interceptor of a
 * server continues that trace, and gives it to the nested calls, so one trace goes from the
 * client to the last handler. Before, the client and the server made two traces.
 */

/** The metadata key of the W3C trace context of a call. */
export const TRACEPARENT_METADATA_KEY = "traceparent";

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const ZERO_TRACE = "0".repeat(32);
const ZERO_SPAN = "0".repeat(16);

/** A trace context: the trace, the span of the caller, and the sampled flag. */
export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly sampled: boolean;
}

/**
 * The size of the pool of random bytes. One fill gives 256 trace ids or 512 span ids. Before
 * (roadmap O94), each id called `getRandomValues` for 8 or 16 bytes: in a chain of 200 steps, the
 * random ids took about 10 % of the per-step time of the host.
 */
export const RANDOM_POOL_BYTES = 4096;

/** The two hex digits of each byte value. */
const HEX = Array.from({ length: 256 }, (_, value) => value.toString(16).padStart(2, "0"));

const pool = new Uint8Array(RANDOM_POOL_BYTES);
// The pool starts empty: the first id fills it
let next = RANDOM_POOL_BYTES;

/** This function fills the pool with new random bytes. Each byte goes to one id only. */
function refill(): void {
  const crypto = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } }).crypto;
  if (crypto?.getRandomValues) crypto.getRandomValues(pool);
  else for (let index = 0; index < RANDOM_POOL_BYTES; index++) pool[index] = Math.floor(Math.random() * 256);
  next = 0;
}

/** This function gives `bytes` random bytes of the pool as hex digits. `bytes` is 16 or less. */
function randomHex(bytes: number): string {
  if (next + bytes > RANDOM_POOL_BYTES) refill();
  let hex = "";
  for (let index = next; index < next + bytes; index++) hex += HEX[pool[index]!]!;
  next += bytes;
  return hex;
}

/** This function makes a new trace id: 32 random hex digits. */
export function newTraceId(): string {
  const id = randomHex(16);
  return id === ZERO_TRACE ? newTraceId() : id;
}

/** This function makes a new span id: 16 random hex digits. */
export function newSpanId(): string {
  const id = randomHex(8);
  return id === ZERO_SPAN ? newSpanId() : id;
}

/** True when the ids have the W3C form. */
export function isW3cIds(traceId: string, spanId: string): boolean {
  return /^[0-9a-f]{32}$/.test(traceId) && /^[0-9a-f]{16}$/.test(spanId) && traceId !== ZERO_TRACE && spanId !== ZERO_SPAN;
}

/** The `traceparent` of a trace and a span. */
export function formatTraceparent(traceId: string, spanId: string, sampled = true): string {
  return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`;
}

/** The trace context of a `traceparent` value, or undefined when it is not valid. */
export function parseTraceparent(value: unknown): TraceContext | undefined {
  if (typeof value !== "string") return undefined;
  const match = TRACEPARENT.exec(value.trim().toLowerCase());
  if (!match) return undefined;
  const [, traceId, spanId, flags] = match;
  if (traceId === ZERO_TRACE || spanId === ZERO_SPAN) return undefined;
  return { traceId: traceId!, spanId: spanId!, sampled: (parseInt(flags!, 16) & 1) === 1 };
}
