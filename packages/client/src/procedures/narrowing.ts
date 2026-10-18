/**
 * The narrowing key of the wire (roadmap CLI-30, `documentation/WIRE-PROTOCOL.md`).
 *
 * A call can ask for a narrower capability than its principal holds: a lower clearance, fewer
 * effects or a shorter time. A narrower capability is always safe, for the same reason as the
 * deadline (`procedure-timeout`). Thus each face carries the key. HTTP has the header
 * `Procedure-Narrowing`, and WebSocket has the metadata of a frame. MCP has the `_meta` of a
 * request, and an invocation in the process has the option `narrow`.
 *
 * The server applies the key after the narrowing of its request hook (`principalOf`). It uses the
 * meet of the clearance order, the intersection of the effects and the earlier deadline. Thus the
 * key can only make the capability narrower. A part that asks for more has no effect, and the
 * server reports it in debug.
 *
 * This module imports no Node code.
 */

import type { Capability, CapabilityRequest, ClearanceOf, ClearanceOrder, PermittedEffects } from "./types.js";
import { UNLIMITED_CAPABILITY, narrowCapability } from "./capability.js";

/** The metadata key of the narrowing of a call. Its value is a `CapabilityRequest` as JSON. */
export const NARROWING_METADATA_KEY = "procedure-narrowing";

/**
 * The HTTP header of the narrowing of a call: the JSON of a `CapabilityRequest`, raw or
 * URI-encoded. The header and the metadata key have the same name.
 */
export const NARROWING_HEADER = "Procedure-Narrowing";

/** A part of a narrowing that has no effect, and the reason. */
export interface NarrowingNote {
  /** The part: the whole narrowing, its clearance, its effects or its time. */
  readonly field: "narrowing" | "clearance" | "effects" | "timeoutMs";
  /**
   * `"widens"`: the part asks for more than the call holds, so the server keeps what the call
   * holds. `"invalid"`: the server cannot read or compare the part, so it ignores the part.
   */
  readonly kind: "widens" | "invalid";
  /** The reason, as a sentence. */
  readonly message: string;
}

/** A narrowing from the wire, and the notes of the parts that the decoder ignored. */
export interface WireNarrowing {
  /** The narrowing, or undefined when the value asks for nothing that the decoder can read. */
  readonly narrowing: CapabilityRequest<unknown> | undefined;
  readonly notes: readonly NarrowingNote[];
}

/** A capability after a narrowing, and the notes of the parts that had no effect. */
export interface NarrowedCapability<C = ClearanceOf> {
  readonly capability: Capability<C>;
  readonly notes: readonly NarrowingNote[];
}

/** The fields of a `CapabilityRequest`. */
const FIELDS: ReadonlySet<string> = new Set(["clearance", "effects", "timeoutMs"]);

/** The fields of `PermittedEffects`. */
const EFFECT_FIELDS: ReadonlySet<string> = new Set(["reads", "writes", "destructive"]);

/** True for an object that is not an array and not null. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** True for a list of resource names. */
function isNameList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((name) => typeof name === "string");
}

/** True for a time of a narrowing: a finite number of milliseconds, zero or more. */
function isTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** The own field of a record, or undefined. A field of the prototype (`__proto__`) does not count. */
function own(record: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/** A short text of a value for a note. */
function describe(value: unknown): string {
  try {
    const text = JSON.stringify(value) ?? String(value);
    return text.length > 80 ? `${text.slice(0, 77)}...` : text;
  } catch {
    return String(value);
  }
}

/** The value of a text: the JSON of the text, or of its URI-decoded form, or undefined. */
function parseText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // The URI-encoded form of a header value that is not Latin-1
  }
  try {
    return JSON.parse(decodeURIComponent(text)) as unknown;
  } catch {
    return undefined;
  }
}

/** The permitted effects of a narrowing from the wire, or undefined. Each part that is not valid gets a note. */
function effectsFromWire(value: unknown, notes: NarrowingNote[]): PermittedEffects | undefined {
  if (!isRecord(value)) {
    notes.push({ field: "effects", kind: "invalid", message: `The effects of the narrowing are not an object: ${describe(value)}` });
    return undefined;
  }
  const result: { reads?: readonly string[] | "any"; writes?: readonly string[] | "any"; destructive?: boolean } = {};
  for (const kind of ["reads", "writes"] as const) {
    const permit = own(value, kind);
    if (permit === undefined) continue;
    if (permit === "any") result[kind] = "any";
    else if (isNameList(permit)) result[kind] = Object.freeze([...permit]);
    else notes.push({ field: "effects", kind: "invalid", message: `The ${kind} of the narrowing are not "any" or a list of names: ${describe(permit)}` });
  }
  const destructive = own(value, "destructive");
  if (typeof destructive === "boolean") result.destructive = destructive;
  else if (destructive !== undefined) notes.push({ field: "effects", kind: "invalid", message: `The destructive flag of the narrowing is not true or false: ${describe(destructive)}` });
  for (const key of Object.keys(value)) {
    if (!EFFECT_FIELDS.has(key)) notes.push({ field: "effects", kind: "invalid", message: `The effects of the narrowing have an unknown field: ${describe(key)}` });
  }
  return Object.keys(result).length > 0 ? (Object.freeze(result) as PermittedEffects) : undefined;
}

/**
 * This function reads the narrowing key of a call (CLI-30): a `CapabilityRequest` as an object,
 * or as the JSON text of a header (raw or URI-encoded). It reads only the own fields `clearance`,
 * `effects` and `timeoutMs`. A part that is not valid gets a note, and the function ignores it.
 * An absent value asks for nothing and gets no note.
 */
export function narrowingOf(value: unknown): WireNarrowing {
  if (value === undefined || value === null || value === "") return { narrowing: undefined, notes: [] };
  const decoded = typeof value === "string" ? parseText(value) : value;
  if (!isRecord(decoded)) {
    return { narrowing: undefined, notes: [{ field: "narrowing", kind: "invalid", message: `The narrowing is not a JSON object: ${describe(value)}` }] };
  }
  const notes: NarrowingNote[] = [];
  const narrowing: CapabilityRequest<unknown> = {};
  const clearance = own(decoded, "clearance");
  if (clearance === null) notes.push({ field: "clearance", kind: "invalid", message: "The clearance of the narrowing is null" });
  else if (clearance !== undefined) narrowing.clearance = clearance;
  const effects = own(decoded, "effects");
  if (effects !== undefined) {
    const permitted = effectsFromWire(effects, notes);
    if (permitted) narrowing.effects = permitted;
  }
  const timeoutMs = own(decoded, "timeoutMs");
  if (isTime(timeoutMs)) narrowing.timeoutMs = timeoutMs;
  else if (timeoutMs !== undefined) notes.push({ field: "timeoutMs", kind: "invalid", message: `The time of the narrowing is not a number of milliseconds: ${describe(timeoutMs)}` });
  for (const key of Object.keys(decoded)) {
    if (!FIELDS.has(key)) notes.push({ field: "narrowing", kind: "invalid", message: `The narrowing has an unknown field: ${describe(key)}` });
  }
  return { narrowing: Object.keys(narrowing).length > 0 ? narrowing : undefined, notes };
}

/** The clearance that a narrowing can apply, or undefined. A clearance that has no effect gets a note. */
function clearanceWithin<C>(held: C | undefined, asked: C, order: ClearanceOrder<C> | undefined, notes: NarrowingNote[]): C | undefined {
  if (held !== undefined && Object.is(held, asked)) return asked;
  if (!order) {
    if (held === undefined) return asked;
    notes.push({ field: "clearance", kind: "invalid", message: `The server has no clearance order, so it cannot compare the clearance ${describe(asked)} with ${describe(held)}` });
    return undefined;
  }
  try {
    // A value outside the order throws here: a ladder throws for a value that it does not have
    if (held === undefined) {
      order.leq(asked, asked);
      return asked;
    }
    const within = order.leq(asked, held);
    order.meet(held, asked);
    if (!within) {
      notes.push({ field: "clearance", kind: "widens", message: `The clearance ${describe(asked)} is not at or below the clearance of the call (${describe(held)}). The part above it has no effect.` });
    }
    return asked;
  } catch {
    notes.push({ field: "clearance", kind: "invalid", message: `The clearance ${describe(asked)} is not a value of the clearance order of the server` });
    return undefined;
  }
}

/** This function adds a note for each part of the asked effects that the held effects do not permit. */
function noteWiderEffects(held: PermittedEffects | undefined, asked: PermittedEffects, notes: NarrowingNote[]): void {
  for (const kind of ["reads", "writes"] as const) {
    const permit = held?.[kind];
    const wanted = asked[kind];
    if (wanted === undefined || permit === undefined || permit === "any") continue;
    const extra = wanted === "any" ? ["any"] : wanted.filter((name) => !permit.includes(name));
    if (extra.length > 0) {
      const holds = permit.length > 0 ? permit.join(", ") : "nothing";
      notes.push({ field: "effects", kind: "widens", message: `The narrowing asks for the ${kind} ${extra.join(", ")}, and the call holds ${holds}. That part has no effect.` });
    }
  }
  if (held?.destructive === false && asked.destructive === true) {
    notes.push({ field: "effects", kind: "widens", message: "The narrowing permits destructive procedures, and the call does not. That part has no effect." });
  }
}

/**
 * This function narrows a capability with a request that can come from outside the host (CLI-30).
 * It is `narrowCapability` that does not throw: a part that the order cannot compare gets a note,
 * and the function ignores it. A part that asks for more than `held` gets a note too. The result
 * is the same as `held`, or narrower. Without `asked`, the result is `held`.
 */
export function narrowWithin<C>(
  held: Capability<C> | undefined,
  asked: CapabilityRequest<unknown> | undefined,
  order?: ClearanceOrder<C>,
  now: number = Date.now()
): NarrowedCapability<C> {
  const base = held ?? (UNLIMITED_CAPABILITY as Capability<C>);
  if (!asked) return { capability: base, notes: [] };
  const notes: NarrowingNote[] = [];
  const request: CapabilityRequest<C> = {};
  if (asked.clearance !== undefined) {
    const clearance = clearanceWithin(base.clearance, asked.clearance as C, order, notes);
    if (clearance !== undefined) request.clearance = clearance;
  }
  if (asked.effects !== undefined) {
    noteWiderEffects(base.effects, asked.effects, notes);
    request.effects = asked.effects;
  }
  if (asked.timeoutMs !== undefined) {
    if (!isTime(asked.timeoutMs)) {
      notes.push({ field: "timeoutMs", kind: "invalid", message: `The time of the narrowing is not a number of milliseconds: ${describe(asked.timeoutMs)}` });
    } else {
      if (base.deadline !== undefined && now + asked.timeoutMs > base.deadline) {
        notes.push({ field: "timeoutMs", kind: "widens", message: `The narrowing asks for ${asked.timeoutMs} ms, and the deadline of the call is earlier. That part has no effect.` });
      }
      request.timeoutMs = asked.timeoutMs;
    }
  }
  return { capability: narrowCapability(base, request, order, now), notes };
}
