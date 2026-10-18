/**
 * The text from outside a host: a web page, a mail, a file of a user (CLI-10).
 *
 * A procedure that gives such text declares the fields of its output that hold it
 * (`metadata.untrusted`). A face that gives text to a model (MCP) then shows that text apart from
 * the data. Envelopes tell the model that this text is data, not instructions. Another face gives
 * the output as it is.
 */

import type { AnyProcedure } from "./types.js";

/** The values of the source of a text: the attributes of its envelope. */
export type UntrustedSource = Readonly<Record<string, string | number | boolean | null | undefined>>;

/** A text from outside the host, with its source: for example the URL and the date of a page. */
export interface UntrustedText {
  readonly text: string;
  readonly source?: UntrustedSource | undefined;
}

/**
 * The value of an untrusted field of an output: a text, a text with its source, or a list of
 * them.
 */
export type UntrustedValue = string | UntrustedText | readonly (string | UntrustedText)[];

/** This function gives a text with its source, for an untrusted field of an output. */
export function untrustedText(text: string, source?: UntrustedSource): UntrustedText {
  return source === undefined ? { text } : { text, source };
}

/** The names of the output fields that hold untrusted text (`metadata.untrusted`). Empty: none. */
export function untrustedFieldsOf(procedure: AnyProcedure): readonly string[] {
  const fields = (procedure.metadata as { untrusted?: unknown } | undefined)?.untrusted;
  return Array.isArray(fields) ? fields.filter((field): field is string => typeof field === "string") : [];
}

/** The texts of the value of an untrusted field, each with its source. Another value gives none. */
export function untrustedTextsOf(value: unknown): UntrustedText[] {
  const one = (item: unknown): UntrustedText | undefined => {
    if (typeof item === "string") return { text: item };
    if (item !== null && typeof item === "object" && typeof (item as { text?: unknown }).text === "string") {
      const { text, source } = item as { text: string; source?: unknown };
      return source !== null && typeof source === "object" ? { text, source: source as UntrustedSource } : { text };
    }
    return undefined;
  };
  const items = Array.isArray(value) ? value : [value];
  return items.map(one).filter((item): item is UntrustedText => item !== undefined);
}
