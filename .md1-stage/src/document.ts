/**
 * Media documents: a small JSON record now, and its files later.
 *
 * A media document has two parts. `$data` is the record of the app. `$media` is the table of its files: each key is the
 * id of a file, the SHA-256 of its bytes as 64 lowercase hex characters. Each entry tells where the file is in `$data`
 * (a JSON Pointer, RFC 6901), its media type, its size and its state. At that pointer, `$data` holds the id.
 *
 * The states are these:
 *
 * - `pending`: the store has no bytes of the file.
 * - `partial`: the store has `received` bytes, more than 0 and fewer than `size`.
 * - `complete`: the store has all the bytes.
 * - `embedded`: the bytes are in the entry, as the canonical base64 text `base64`.
 * - `linked`: the bytes are at the URL `url` (http or https).
 *
 * Thus a reader can show the record before its files are complete. Because the id is the hash of the bytes, an upload
 * is idempotent, and a store can examine each file that it gets.
 */

import { ok, err, type Result } from "@mark1russell7/optional";
import { assertJson, formatPointer, lookup, parsePointer, type JsonValue } from "@procedures/json";
import { base64Size, decodeBase64 } from "./base64.js";

/** The states of a file, in the order of an upload. */
export const MEDIA_STATES = ["pending", "partial", "complete", "embedded", "linked"] as const;

/** The state of a file. */
export type MediaState = (typeof MEDIA_STATES)[number];

/** The fields that each entry has. */
export interface MediaEntryBase {
  /** The JSON Pointer of the file in `$data`. */
  readonly path: string;
  /** The media type (RFC 6838), in lowercase, for example `image/jpeg`. */
  readonly type: string;
  /** The number of bytes of the file. */
  readonly size: number;
  /** The SHA-256 of the bytes, as 64 lowercase hex characters. It is equal to the key of the entry. */
  readonly sha256: string;
}

/** An entry of the media table. The state selects the other fields. */
export type MediaEntry =
  | (MediaEntryBase & { readonly state: "pending" })
  | (MediaEntryBase & { readonly state: "partial"; readonly received: number })
  | (MediaEntryBase & { readonly state: "complete" })
  | (MediaEntryBase & { readonly state: "embedded"; readonly base64: string })
  | (MediaEntryBase & { readonly state: "linked"; readonly url: string });

/** The media table: each file by its id. */
export type MediaTable = Readonly<Record<string, MediaEntry>>;

/** A media document: the record of the app in `$data`, and the table of its files in `$media`. */
export interface MediaDocument<D extends JsonValue = JsonValue> {
  readonly $media: MediaTable;
  readonly $data: D;
}

/** The kind of a problem in a media document. */
export type MediaIssueCode =
  | "NOT_OBJECT"
  | "MISSING_FIELD"
  | "UNKNOWN_FIELD"
  | "NOT_JSON"
  | "BAD_ID"
  | "ID_MISMATCH"
  | "BAD_TYPE"
  | "BAD_SIZE"
  | "BAD_STATE"
  | "BAD_PATH"
  | "PATH_NOT_FOUND"
  | "PATH_NOT_ID"
  | "PATH_SHARED"
  | "BAD_RECEIVED"
  | "BAD_BASE64"
  | "SIZE_MISMATCH"
  | "BAD_URL";

/** A problem in a media document. `at` is the JSON Pointer of the bad value in the document. */
export interface MediaIssue {
  readonly at: string;
  readonly code: MediaIssueCode;
  readonly message: string;
}

const ID = /^[0-9a-f]{64}$/;

/** This function tells if a text is a media id: 64 lowercase hex characters. */
export function isMediaId(text: unknown): text is string {
  return typeof text === "string" && ID.test(text);
}

// RFC 6838, section 4.2: a name has 1 to 127 characters, and starts with a letter or a digit.
const NAME = "[a-z0-9][a-z0-9!#$&^_.+-]{0,126}";
const TOKEN = "[a-z0-9!#$%&'*+.^_`|~-]+";
const QUOTED = '"(?:[^"\\\\\\r\\n]|\\\\.)*"';
const MEDIA_TYPE = new RegExp(`^${NAME}/${NAME}(?:; ?${TOKEN}=(?:[A-Za-z0-9!#$%&'*+.^_\`|~-]+|${QUOTED}))*$`);

/** This function tells if a text is a media type in lowercase, with optional parameters (`text/plain; charset=utf-8`). */
export function isMediaType(text: unknown): text is string {
  return typeof text === "string" && MEDIA_TYPE.test(text);
}

/** This function tells if a text is an absolute http or https URL. */
export function isMediaUrl(text: unknown): text is string {
  if (typeof text !== "string") return false;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** The fields of each state, after the base fields. */
const STATE_FIELDS: Readonly<Record<MediaState, readonly string[]>> = {
  pending: [],
  partial: ["received"],
  complete: [],
  embedded: ["base64"],
  linked: ["url"],
};

const BASE_FIELDS = ["path", "type", "size", "sha256", "state"] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isState(value: unknown): value is MediaState {
  return typeof value === "string" && (MEDIA_STATES as readonly string[]).includes(value);
}

/** The text of an unknown value in a message. */
function shown(value: unknown): string {
  const text = typeof value === "string" ? JSON.stringify(value) : String(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

/**
 * This function examines a value as a media document. It gives the document, or each problem that it found. A problem
 * in one entry does not stop the examination of the other entries.
 */
export function checkMediaDocument(value: unknown): Result<MediaDocument, readonly MediaIssue[]> {
  const issues: MediaIssue[] = [];
  const add = (tokens: readonly (string | number)[], code: MediaIssueCode, message: string): void => {
    issues.push({ at: formatPointer(tokens), code, message });
  };
  if (!isObject(value)) {
    add([], "NOT_OBJECT", "A media document is an object with the fields $media and $data");
    return err(issues);
  }
  for (const key of Object.keys(value)) {
    if (key !== "$media" && key !== "$data") add([key], "UNKNOWN_FIELD", `A media document has only $media and $data, not ${shown(key)}`);
  }
  if (!(Object.hasOwn(value, "$data"))) add(["$data"], "MISSING_FIELD", "A media document needs the field $data");
  if (!(Object.hasOwn(value, "$media"))) add(["$media"], "MISSING_FIELD", "A media document needs the field $media");
  const data = value.$data;
  let dataIsJson = Object.hasOwn(value, "$data");
  if (dataIsJson) {
    try {
      assertJson(data, "$data");
    } catch (error) {
      dataIsJson = false;
      add(["$data"], "NOT_JSON", error instanceof Error ? error.message : String(error));
    }
  }
  const media = value.$media;
  if (Object.hasOwn(value, "$media") && !isObject(media)) add(["$media"], "NOT_OBJECT", "The field $media is an object: each file by its id");
  if (isObject(media)) {
    const owners = new Map<string, string>();
    for (const [id, entry] of Object.entries(media)) {
      checkEntry(id, entry, dataIsJson ? (data as JsonValue) : undefined, owners, add);
    }
  }
  return issues.length === 0 ? ok(value as unknown as MediaDocument) : err(issues);
}

type Add = (tokens: readonly (string | number)[], code: MediaIssueCode, message: string) => void;

function checkEntry(id: string, entry: unknown, data: JsonValue | undefined, owners: Map<string, string>, add: Add): void {
  const at = ["$media", id];
  if (!isMediaId(id)) add(at, "BAD_ID", `The id ${shown(id)} is not a SHA-256 in 64 lowercase hex characters`);
  if (!isObject(entry)) {
    add(at, "NOT_OBJECT", "An entry of $media is an object with path, type, size, sha256 and state");
    return;
  }
  for (const field of BASE_FIELDS) {
    if (!Object.hasOwn(entry, field)) add([...at, field], "MISSING_FIELD", `An entry of $media needs the field ${field}`);
  }
  const { path, type, size, sha256, state } = entry;
  if (Object.hasOwn(entry, "sha256") && sha256 !== id) add([...at, "sha256"], "ID_MISMATCH", "The field sha256 of an entry is equal to its id");
  if (Object.hasOwn(entry, "type") && !isMediaType(type)) add([...at, "type"], "BAD_TYPE", `The type ${shown(type)} is not a media type in lowercase, for example image/jpeg`);
  const sizeIsGood = Number.isSafeInteger(size) && (size as number) >= 0;
  if (Object.hasOwn(entry, "size") && !sizeIsGood) add([...at, "size"], "BAD_SIZE", `The size ${shown(size)} is not a safe integer of 0 or more`);
  if (Object.hasOwn(entry, "state") && !isState(state)) add([...at, "state"], "BAD_STATE", `The state ${shown(state)} is not one of ${MEDIA_STATES.join(", ")}`);
  if (Object.hasOwn(entry, "path")) checkPath(id, path, data, owners, [...at, "path"], add);
  if (!isState(state)) return;
  const allowed = new Set<string>([...BASE_FIELDS, ...STATE_FIELDS[state]]);
  for (const field of Object.keys(entry)) {
    if (!allowed.has(field)) add([...at, field], "UNKNOWN_FIELD", `An entry in the state ${state} has no field ${shown(field)}`);
  }
  for (const field of STATE_FIELDS[state]) {
    if (!Object.hasOwn(entry, field)) add([...at, field], "MISSING_FIELD", `An entry in the state ${state} needs the field ${field}`);
  }
  if (state === "partial" && Object.hasOwn(entry, "received")) {
    const received = entry.received;
    const good = Number.isSafeInteger(received) && (received as number) > 0 && (!sizeIsGood || (received as number) < (size as number));
    if (!good) add([...at, "received"], "BAD_RECEIVED", `The count received ${shown(received)} of a partial file is more than 0 and less than its size`);
  }
  if (state === "embedded" && Object.hasOwn(entry, "base64")) {
    const text = entry.base64;
    if (typeof text !== "string" || decodeBase64(text) === undefined) {
      add([...at, "base64"], "BAD_BASE64", "The field base64 is the canonical base64 text of the bytes (RFC 4648, with padding)");
    } else if (sizeIsGood && base64Size(text) !== size) {
      add([...at, "base64"], "SIZE_MISMATCH", `The base64 text has ${base64Size(text)} bytes, but the size is ${String(size)}`);
    }
  }
  if (state === "linked" && Object.hasOwn(entry, "url") && !isMediaUrl(entry.url)) {
    add([...at, "url"], "BAD_URL", `The url ${shown(entry.url)} is not an absolute http or https URL`);
  }
}

function checkPath(id: string, path: unknown, data: JsonValue | undefined, owners: Map<string, string>, at: readonly string[], add: Add): void {
  if (typeof path !== "string" || path.startsWith("#")) {
    add(at, "BAD_PATH", `The path ${shown(path)} is not a JSON Pointer: it is "" or starts with "/"`);
    return;
  }
  let tokens: string[];
  try {
    tokens = parsePointer(path, "path");
  } catch (error) {
    add(at, "BAD_PATH", error instanceof Error ? error.message : String(error));
    return;
  }
  const owner = owners.get(path);
  if (owner !== undefined) add(at, "PATH_SHARED", `The path ${shown(path)} is also the path of the file ${owner}`);
  else owners.set(path, id);
  if (data === undefined) return;
  const found = lookup(data, tokens);
  if (!found.found) add(at, "PATH_NOT_FOUND", `The path ${shown(path)} is not in $data`);
  else if (found.value !== id) add(at, "PATH_NOT_ID", `At the path ${shown(path)}, $data holds ${shown(found.value)}, not the id of the file`);
}

/** This function gives the document, or throws a `MediaDocumentError` with each problem. */
export function assertMediaDocument(value: unknown): MediaDocument {
  const result = checkMediaDocument(value);
  if (result.tag === "err") throw new MediaDocumentError(result.error);
  return result.value;
}

/** The error of a value that is not a media document. It has the list of the problems. */
export class MediaDocumentError extends Error {
  readonly issues: readonly MediaIssue[];
  constructor(issues: readonly MediaIssue[]) {
    const first = issues[0];
    const more = issues.length > 1 ? ` (and ${issues.length - 1} more)` : "";
    super(first === undefined ? "The value is not a media document" : `${first.at || "/"}: ${first.message}${more}`);
    this.name = "MediaDocumentError";
    this.issues = issues;
  }
}
