/**
 * The narrowing key of the wire (roadmap CLI-30, `documentation/WIRE-PROTOCOL.md`).
 *
 * A call can ask for a narrower capability than its principal holds: a lower clearance, fewer
 * effects or a shorter time. A narrower capability is always safe, for the same reason as the
 * deadline (`procedure-timeout`). Thus each face carries the key. HTTP has the header
 * `Procedure-Narrowing`, and WebSocket has the metadata of a frame. MCP has the `_meta` of a
 * request, and an invocation in the process has the option `narrow`.
 *
 * A request can have more than one source of narrowing, for example the header of a gateway and
 * the key of `X-Metadata` of the client. No source replaces another: the value of the key
 * becomes a list of the sources (`addNarrowing`). The invocation of the host applies all the
 * sources. The clearance is the meet of the clearance order, the effects are the intersection,
 * and the deadline is the earliest. Thus each source can only narrow, in each sequence.
 *
 * A part that asks for more has no effect. A part that the server cannot read or compare has no
 * effect too. A source that the server cannot read at all refuses the call, because the server
 * does not know what that source asks for. The notes of these parts go to the debug reports.
 *
 * This module imports no Node code.
 */

import type { Capability, CapabilityRequest, ClearanceOf, ClearanceOrder, PermittedEffects } from "./types.js";
import { UNLIMITED_CAPABILITY, narrowCapability } from "./capability.js";

/**
 * The metadata key of the narrowing of a call. Its value is a `CapabilityRequest` as an object or
 * as JSON text, or a list of them: each item is one source.
 */
export const NARROWING_METADATA_KEY = "procedure-narrowing";

/**
 * The HTTP header of the narrowing of a call: the JSON of a `CapabilityRequest`, raw or
 * URI-encoded. The header and the metadata key have the same name.
 */
export const NARROWING_HEADER = "Procedure-Narrowing";

/** A part of a narrowing that has no effect or that refuses the call, and the reason. */
export interface NarrowingNote {
  /** The part: a whole source, its clearance, its effects or its time. */
  readonly field: "narrowing" | "clearance" | "effects" | "timeoutMs";
  /**
   * - `"widens"`: the part asks for more than the call holds, so it has no effect.
   * - `"invalid"`: the server cannot read or compare the part, so it ignores the part.
   * - `"refused"`: the server refuses the call. A source that it cannot read (the field
   *   `narrowing`) gives `INVALID_REQUEST`. Clearances without a meet (the field `clearance`)
   *   give `FORBIDDEN` with the reason `clearance`.
   */
  readonly kind: "widens" | "invalid" | "refused";
  /** The reason, as a sentence. */
  readonly message: string;
}

/** The sources of narrowing from the wire, and the notes of the parts that the decoder did not take. */
export interface WireNarrowing {
  /** The sources that the decoder can read, in their sequence. Each one can only narrow. */
  readonly narrowings: readonly CapabilityRequest<unknown>[];
  readonly notes: readonly NarrowingNote[];
}

/** A capability after a narrowing, and the notes of the parts that had no effect. */
export interface NarrowedCapability<C = ClearanceOf> {
  /** The narrowed capability. When the narrowing refuses the call, it is the capability that the call held. */
  readonly capability: Capability<C>;
  readonly notes: readonly NarrowingNote[];
  /** The note that refuses the call, or undefined when the call can go on. */
  readonly refusal?: NarrowingNote | undefined;
}

/** The fields of a `CapabilityRequest`. */
const FIELDS: ReadonlySet<string> = new Set(["clearance", "effects", "timeoutMs"]);

/** The fields of `PermittedEffects`. */
const EFFECT_FIELDS: ReadonlySet<string> = new Set(["reads", "writes", "destructive"]);

/** The depth of the lists and the texts in one value of the key: a list of texts of lists. */
const MAX_DEPTH = 4;

/** The value of `parseText` for a text that is not JSON. */
const UNREADABLE: unique symbol = Symbol("unreadable");

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

/** The JSON value of a text, or `UNREADABLE`. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return UNREADABLE;
  }
}

/**
 * The value of a text: its JSON, or the JSON of its URI-decoded form. Two header values that a
 * server joined with ", " are two JSON objects with a comma between them: the function reads them
 * as a list.
 */
function parseText(text: string): unknown {
  let decoded: string | undefined;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    decoded = undefined;
  }
  for (const candidate of decoded === undefined || decoded === text ? [text] : [text, decoded]) {
    for (const json of [candidate, `[${candidate}]`]) {
      const value = parseJson(json);
      if (value !== UNREADABLE) return value;
    }
  }
  return UNREADABLE;
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

/** The source of one object, or undefined when it asks for nothing that the decoder can read. */
function sourceOf(record: Record<string, unknown>, notes: NarrowingNote[]): CapabilityRequest<unknown> | undefined {
  const narrowing: CapabilityRequest<unknown> = {};
  const clearance = own(record, "clearance");
  if (clearance === null) notes.push({ field: "clearance", kind: "invalid", message: "The clearance of the narrowing is null" });
  else if (clearance !== undefined) narrowing.clearance = clearance;
  const effects = own(record, "effects");
  if (effects !== undefined) {
    const permitted = effectsFromWire(effects, notes);
    if (permitted) narrowing.effects = permitted;
  }
  const timeoutMs = own(record, "timeoutMs");
  if (isTime(timeoutMs)) narrowing.timeoutMs = timeoutMs;
  else if (timeoutMs !== undefined) notes.push({ field: "timeoutMs", kind: "invalid", message: `The time of the narrowing is not a number of milliseconds: ${describe(timeoutMs)}` });
  for (const key of Object.keys(record)) {
    if (!FIELDS.has(key)) notes.push({ field: "narrowing", kind: "invalid", message: `The narrowing has an unknown field: ${describe(key)}` });
  }
  return Object.keys(narrowing).length > 0 ? narrowing : undefined;
}

/** This function reads the sources of one value of the key into `sources`. */
function collect(value: unknown, depth: number, sources: CapabilityRequest<unknown>[], notes: NarrowingNote[]): void {
  if (value === undefined || value === null || value === "") return;
  if (depth > MAX_DEPTH) {
    notes.push({ field: "narrowing", kind: "refused", message: "The narrowing has too many nested lists or texts" });
    return;
  }
  if (typeof value === "string") {
    const parsed = parseText(value);
    if (parsed === UNREADABLE) notes.push({ field: "narrowing", kind: "refused", message: `The narrowing is not JSON: ${describe(value)}` });
    else collect(parsed, depth + 1, sources, notes);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, depth + 1, sources, notes);
    return;
  }
  if (!isRecord(value)) {
    notes.push({ field: "narrowing", kind: "refused", message: `The narrowing is not a JSON object: ${describe(value)}` });
    return;
  }
  const source = sourceOf(value, notes);
  if (source) sources.push(source);
}

/**
 * This function reads the narrowing key of a call (CLI-30). The value is a `CapabilityRequest` as
 * an object or as the JSON text of a header, or a list of them. It reads only the own
 * fields `clearance`, `effects` and `timeoutMs`. A part that is not valid gets a note, and the
 * function ignores the part. A source that is not a JSON object gets a note of the kind
 * `"refused"`. An absent value asks for nothing and gets no note.
 */
export function narrowingOf(value: unknown): WireNarrowing {
  const narrowings: CapabilityRequest<unknown>[] = [];
  const notes: NarrowingNote[] = [];
  collect(value, 0, narrowings, notes);
  return { narrowings, notes };
}

/**
 * This function adds a source to the value of the narrowing key. The result is a list of the
 * sources, so no source replaces another. A face calls it for each source of a request: a header,
 * a key of `X-Metadata`, the `_meta` of MCP.
 */
export function addNarrowing(current: unknown, source: unknown): unknown {
  if (source === undefined) return current;
  if (current === undefined) return source;
  return [...(Array.isArray(current) ? current : [current]), ...(Array.isArray(source) ? source : [source])];
}

/**
 * The clearance that a source can apply, or undefined. A value outside the order gets a note, and a
 * value above the held clearance gets a note too.
 */
function clearanceOf<C>(held: C | undefined, asked: C, order: ClearanceOrder<C> | undefined, notes: NarrowingNote[]): C | undefined {
  if (!order) return asked;
  try {
    // A value outside the order throws here: a ladder throws for a value that it does not have
    order.leq(asked, asked);
    if (held !== undefined && !Object.is(held, asked) && !order.leq(asked, held)) {
      notes.push({ field: "clearance", kind: "widens", message: `The clearance ${describe(asked)} is not at or below the clearance of the call (${describe(held)}). The part above it has no effect.` });
    }
    return asked;
  } catch {
    notes.push({ field: "clearance", kind: "invalid", message: `The clearance ${describe(asked)} is not a value of the clearance order of the server` });
    return undefined;
  }
}

/** The result of `meetOf` when the clearances have no meet. */
const NO_MEET: unique symbol = Symbol("no meet");

/** The meet of the held clearance and the clearances of the sources, or `NO_MEET` with a note. */
function meetOf<C>(held: C | undefined, asked: readonly C[], order: ClearanceOrder<C> | undefined, notes: NarrowingNote[]): C | undefined | typeof NO_MEET {
  const values = held === undefined ? [...asked] : [held, ...asked];
  if (values.length === 0) return undefined;
  if (!order) {
    // Without an order, two clearances meet only when they are the same value
    const distinct = values.filter((value, index) => values.findIndex((other) => Object.is(other, value)) === index);
    if (distinct.length === 1) return distinct[0];
    notes.push({ field: "clearance", kind: "refused", message: `The server has no clearance order, so it cannot meet the clearances ${distinct.map(describe).join(" and ")}` });
    return NO_MEET;
  }
  try {
    return values.reduce((met, value) => order.meet(met, value));
  } catch (error) {
    notes.push({ field: "clearance", kind: "refused", message: `The clearance order cannot meet the clearances: ${error instanceof Error ? error.message : String(error)}` });
    return NO_MEET;
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
 * This function narrows a capability with one or more sources that can come from outside the host
 * (CLI-30). The clearance is the meet of the held clearance and of each source, the effects are the
 * intersection, and the deadline is the earliest. Thus the result does not depend on the sequence
 * of the sources, and each source can only make it narrower.
 *
 * The function does not throw. A part that asks for more than `held`, or that the order cannot
 * compare, gets a note and has no effect. Clearances without a meet (two different values and no
 * order) give `refusal`: the caller refuses the call.
 */
export function narrowWithin<C>(
  held: Capability<C> | undefined,
  asked: CapabilityRequest<unknown> | readonly CapabilityRequest<unknown>[] | undefined,
  order?: ClearanceOrder<C>,
  now: number = Date.now()
): NarrowedCapability<C> {
  const base = held ?? (UNLIMITED_CAPABILITY as Capability<C>);
  const sources: readonly CapabilityRequest<unknown>[] = asked === undefined ? [] : Array.isArray(asked) ? asked : [asked as CapabilityRequest<unknown>];
  if (sources.length === 0) return { capability: base, notes: [] };
  const notes: NarrowingNote[] = [];
  const clearances: C[] = [];
  let capability = base;
  for (const source of sources) {
    if (source.clearance !== undefined) {
      const clearance = clearanceOf(base.clearance, source.clearance as C, order, notes);
      if (clearance !== undefined) clearances.push(clearance);
    }
    const part: CapabilityRequest<C> = {};
    if (source.effects !== undefined) {
      noteWiderEffects(base.effects, source.effects, notes);
      part.effects = source.effects;
    }
    if (source.timeoutMs !== undefined) {
      if (!isTime(source.timeoutMs)) {
        notes.push({ field: "timeoutMs", kind: "invalid", message: `The time of the narrowing is not a number of milliseconds: ${describe(source.timeoutMs)}` });
      } else {
        if (base.deadline !== undefined && now + source.timeoutMs > base.deadline) {
          notes.push({ field: "timeoutMs", kind: "widens", message: `The narrowing asks for ${source.timeoutMs} ms, and the deadline of the call is earlier. That part has no effect.` });
        }
        part.timeoutMs = source.timeoutMs;
      }
    }
    // Without a clearance, the narrowing of the effects and of the time does not throw
    capability = narrowCapability(capability, part, order, now);
  }
  const met = meetOf(base.clearance, clearances, order, notes);
  if (met === NO_MEET) return { capability: base, notes, refusal: notes.find((note) => note.kind === "refused") };
  if (met !== undefined) {
    try {
      capability = narrowCapability(capability, { clearance: met }, order, now);
    } catch (error) {
      const refusal: NarrowingNote = { field: "clearance", kind: "refused", message: `The clearance order cannot meet the clearances: ${error instanceof Error ? error.message : String(error)}` };
      notes.push(refusal);
      return { capability: base, notes, refusal };
    }
  }
  return { capability, notes };
}
