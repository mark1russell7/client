/**
 * The codecs of an exports manifest (d40-generator-codecs): the JSON form of the values that JSON
 * cannot hold. The keyword `x-procedures-codec` of a schema names the codec (`ExportsCodec`).
 *
 * The loader decodes an input with its schema before the call, so the function gets a `bigint`, a
 * `Map` or a `Set`. `jsonValue()` encodes an output from the value. The codec is in the manifest, so
 * each face of a procedure (in process, HTTP, MCP, the CLI) reads the same JSON form.
 */

import * as z from "zod";
import { reachesNode, resolvedSchema, withDefinitions } from "./definitions.js";
import { CODEC_KEYWORD, PROGRAM_KEYWORD, type ExportsCodec, type ExportsJsonSchema, type ExportsManifest } from "./types.js";

type Definitions = ExportsManifest["$defs"];

/** The pattern of the JSON form of a bigint: a decimal integer, with no plus sign and no leading zero. */
export const BIGINT_PATTERN = "^-?(0|[1-9][0-9]*)$";

/** The results of `reachesCodec()`, by schema: a schema object belongs to one manifest. */
const REACHES = new WeakMap<object, boolean>();

/**
 * True when a schema has a codec, also through its definitions. The search does not go into a
 * sub-program: the loader gives a function at its position, and the program decodes its own result.
 */
export function reachesCodec(schema: unknown, defs: Definitions): boolean {
  return reachesNode(schema, defs, (node) => CODEC_KEYWORD in node, REACHES, (node) => PROGRAM_KEYWORD in node);
}

/** A function that gives the decoded form of a value that agrees with a schema. */
export type CodecDecoder = (value: unknown) => unknown;

/**
 * This function gives the decoder of a schema: it gives the value with the decoded form at each
 * codec. The result is undefined when the schema has no codec, so a call with only JSON values
 * does no work. The decoder copies only the arrays and the objects that change.
 *
 * The decoder takes a value that agrees with the schema. In a union, the value goes to the first
 * member whose schema accepts it, as the order of the members in the type.
 */
export function codecDecoder(schema: ExportsJsonSchema, defs: Definitions): CodecDecoder | undefined {
  if (!reachesCodec(schema, defs)) return undefined;
  // The schema of each member of a union, made at the first value that needs it
  const members = new Map<object, z.ZodType>();
  const accepts = (member: object, value: unknown): boolean => {
    let compiled = members.get(member);
    if (compiled === undefined) {
      compiled = z.fromJSONSchema(withDefinitions(member as ExportsJsonSchema, defs) as never) as z.ZodType;
      members.set(member, compiled);
    }
    return compiled.safeParse(value).success;
  };

  const decode = (value: unknown, at: unknown): unknown => {
    const node = resolvedSchema(at, defs);
    if (node === undefined || !reachesCodec(node, defs)) return value;
    const codec = node[CODEC_KEYWORD] as ExportsCodec | undefined;
    if (codec === "bigint") return typeof value === "string" ? BigInt(value) : value;
    const anyOf = node["anyOf"];
    if (Array.isArray(anyOf)) {
      const member = (anyOf as unknown[]).find((item) => item !== null && typeof item === "object" && accepts(item, value));
      return member === undefined ? value : decode(value, member);
    }
    if (Array.isArray(value)) {
      const items = decodeItems(value, node);
      // An `iterable` stays a list: a list is an iterable
      if (codec === "map") return new Map(items as Array<[unknown, unknown]>);
      if (codec === "set") return new Set(items);
      return items;
    }
    if (value === null || typeof value !== "object") return value;
    const properties = (node["properties"] ?? {}) as Record<string, unknown>;
    const additional = node["additionalProperties"];
    let copy: Record<string, unknown> | undefined;
    for (const [key, item] of Object.entries(value)) {
      const decoded = decode(item, Object.hasOwn(properties, key) ? properties[key] : additional);
      if (decoded !== item) (copy ??= { ...(value as Record<string, unknown>) })[key] = decoded;
    }
    return copy ?? value;
  };

  // The items of a list, each with the schema of its position: a member of `prefixItems`, or `items`
  const decodeItems = (value: readonly unknown[], node: Record<string, unknown>): unknown[] => {
    const prefix = Array.isArray(node["prefixItems"]) ? (node["prefixItems"] as unknown[]) : [];
    let copy: unknown[] | undefined;
    for (const [index, item] of value.entries()) {
      const decoded = decode(item, index < prefix.length ? prefix[index] : node["items"]);
      if (decoded !== item) (copy ??= [...value])[index] = decoded;
    }
    return copy ?? (value as unknown[]);
  };

  return (value) => decode(value, schema);
}
