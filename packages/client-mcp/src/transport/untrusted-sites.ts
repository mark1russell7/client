/**
 * The untrusted fields of an output, at each depth (CLI-10).
 *
 * A field is untrusted when the tool declares it (`metadata.untrusted`), or when the invocation
 * marked its object (`markUntrusted()` of `@procedures/client`). The mark goes with the output of
 * a procedure into the output of each caller: `client.chain`, a procedure of `procedure.define`, or
 * a procedure of code that gives the object.
 */

import { untrustedMarkOf, untrustedTextsOf, type UntrustedText } from "@procedures/client";

/** One untrusted field of an output. */
export interface UntrustedSite {
  /** The path of the field from the top of the output, with dots: for example `steps.0.web_content`. */
  readonly label: string;
  /** True for a field at the top of the output that the tool declares. */
  readonly declared: boolean;
  /** The texts of the field, each with its source. */
  readonly texts: readonly UntrustedText[];
}

/** An output with its untrusted fields apart. */
export interface SeparatedOutput {
  /** The output without its untrusted fields. Without a site, the output itself. */
  readonly data: unknown;
  /**
   * The output for the structured content. A declared field is absent. Each text of another
   * untrusted field is in its envelope, with the same shape: a text stays a text.
   */
  readonly structured: unknown;
  /** The untrusted fields: the declared fields first, in the order of the tool. */
  readonly sites: readonly UntrustedSite[];
}

/** A function that gives one text in its envelope. It gets the text and the label of its field. */
export type Enclose = (text: UntrustedText, label: string) => string;

/** True for an object of the JSON shape: its prototype is `Object.prototype` or null. */
function isPlain(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

/** The text with the path of its field as an attribute of its envelope. */
function labelled(text: UntrustedText, label: string): UntrustedText {
  return { text: text.text, source: { ...text.source, field: label } };
}

/** The value of an untrusted field with each text in its envelope. A value with no text is undefined. */
function enclosedValue(value: unknown, label: string, enclose: Enclose): unknown {
  const one = (item: unknown): unknown => {
    if (Array.isArray(item)) return undefined;
    const [text] = untrustedTextsOf(item);
    if (!text) return undefined;
    const sealed = enclose(labelled(text, label), label);
    return typeof item === "string" ? sealed : { ...(item as object), text: sealed };
  };
  if (Array.isArray(value)) return value.map(one).filter((item) => item !== undefined);
  return one(value);
}

/** The two copies of one part of an output. */
interface Part {
  readonly data: unknown;
  readonly structured: unknown;
}

/**
 * This function separates the untrusted fields of an output. It copies only the objects on the
 * path to an untrusted field, so an output without one stays the same object. A shared object
 * gets one copy, and its fields one site, with the path where the walk first finds it.
 */
export function separateUntrusted(value: unknown, declared: readonly string[], enclose: Enclose): SeparatedOutput {
  const sites: UntrustedSite[] = [];
  const parts = new Map<object, Part>();
  const walk = (node: unknown, path: readonly string[], top: boolean): Part => {
    if (node === null || typeof node !== "object") return { data: node, structured: node };
    const known = parts.get(node);
    if (known) return known;
    const same: Part = { data: node, structured: node };
    // A cycle meets the object itself, as the JSON text does
    parts.set(node, same);
    let part = same;
    if (Array.isArray(node)) {
      const data: unknown[] = [];
      const structured: unknown[] = [];
      let changed = false;
      node.forEach((item: unknown, index) => {
        const inner = walk(item, [...path, String(index)], false);
        data.push(inner.data);
        structured.push(inner.structured);
        if (inner.data !== item || inner.structured !== item) changed = true;
      });
      if (changed) part = { data, structured };
    } else {
      const marks = untrustedMarkOf(node);
      const fields = top ? [...new Set([...declared, ...marks])] : marks;
      if (fields.length > 0 || isPlain(node)) {
        const record = node as Record<string, unknown>;
        const data: Record<string, unknown> = { ...record };
        const structured: Record<string, unknown> = { ...record };
        let changed = false;
        for (const field of fields) {
          if (!Object.hasOwn(record, field)) continue;
          changed = true;
          // path-check: the label of a field path in the result (`items.0.text`), not a procedure path
          const label = [...path, field].join(".");
          const own = top && declared.includes(field);
          const texts = untrustedTextsOf(record[field]);
          sites.push({ label, declared: own, texts: own ? texts : texts.map((text) => labelled(text, label)) });
          delete data[field];
          const sealed = own ? undefined : enclosedValue(record[field], label, enclose);
          if (sealed === undefined) delete structured[field];
          else structured[field] = sealed;
        }
        for (const key of Object.keys(record)) {
          if (fields.includes(key)) continue;
          const inner = walk(record[key], [...path, key], false);
          if (inner.data === record[key] && inner.structured === record[key]) continue;
          changed = true;
          data[key] = inner.data;
          structured[key] = inner.structured;
        }
        if (changed) part = { data, structured };
      }
    }
    parts.set(node, part);
    return part;
  };
  const { data, structured } = walk(value, [], true);
  return { data, structured, sites };
}
