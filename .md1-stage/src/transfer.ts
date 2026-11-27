/**
 * The steps of an upload, as pure functions on a media document.
 *
 * 1. The client adds each file to its document (`addMedia`), with its id at its path in `$data`.
 * 2. The client strips the embedded bytes (`stripMedia`) and sends the small document. The server stores it.
 * 3. The server answers with the ids that its store does not have (`missingIds`).
 * 4. The client sends each missing file in chunks (`planChunks`). The server sets the count of each file (`withReceived`).
 *
 * A small file can stay in the document (`embedMedia`), or it can be at a URL (`linkMedia`). Each function gives a
 * new document and does not change its input.
 */

import { applyPatch, arrayIndex, formatPointer, lookup, parsePointer } from "@procedures/json";
import { decodeBase64, encodeBase64 } from "./base64.js";
import { assertMediaDocument, isMediaId, isMediaUrl, type MediaDocument, type MediaEntry, type MediaEntryBase, type MediaTable } from "./document.js";

/** The ids of a document, in sorted order. */
export function mediaIds(document: MediaDocument): string[] {
  return Object.keys(document.$media).sort();
}

/** This function tells if the store must get the bytes of an entry: its bytes are not in the document and not at a URL. */
export function isStored(entry: MediaEntry): boolean {
  return entry.state !== "embedded" && entry.state !== "linked";
}

/**
 * This function gives the ids of the files that the store must get, in sorted order: each file that is not embedded
 * and not linked, and that `has` does not have. The state in the document does not count, because a server does not
 * trust the state from a client.
 */
export function missingIds(document: MediaDocument, has: (id: string) => boolean): string[] {
  return mediaIds(document).filter((id) => isStored(document.$media[id]!) && !has(id));
}

function base(entry: MediaEntry): MediaEntryBase {
  return { path: entry.path, type: entry.type, size: entry.size, sha256: entry.sha256 };
}

function withEntry(document: MediaDocument, id: string, entry: MediaEntry): MediaDocument {
  const $media: MediaTable = { ...document.$media, [id]: entry };
  return { $media, $data: document.$data };
}

function entryOf(document: MediaDocument, id: string): MediaEntry {
  if (!Object.hasOwn(document.$media, id)) throw new RangeError(`The document has no file with the id ${id}`);
  return document.$media[id]!;
}

/** The result of `stripMedia`: the small document and the bytes that left it. */
export interface StrippedMedia {
  readonly document: MediaDocument;
  /** The bytes of each file that was embedded, by id. */
  readonly files: ReadonlyMap<string, Uint8Array>;
}

/**
 * This function moves the bytes of each embedded file out of the document. Each of these files becomes `pending`.
 * The other entries do not change.
 */
export function stripMedia(document: MediaDocument): StrippedMedia {
  const files = new Map<string, Uint8Array>();
  const $media: Record<string, MediaEntry> = {};
  for (const id of mediaIds(document)) {
    const entry = document.$media[id]!;
    if (entry.state === "embedded") {
      files.set(id, decodeEmbedded(id, entry.base64));
      $media[id] = { ...base(entry), state: "pending" };
    } else {
      $media[id] = entry;
    }
  }
  return { document: { $media, $data: document.$data }, files };
}

function decodeEmbedded(id: string, text: string): Uint8Array {
  const bytes = decodeBase64(text);
  if (bytes === undefined) throw new RangeError(`The file ${id} has a base64 text that is not canonical`);
  return bytes;
}

/** The options of `embedMedia`. */
export interface EmbedOptions {
  /** The largest file that the document holds, in bytes. The default is 65536 (64 KiB). */
  readonly maxBytes?: number;
}

/** The default largest size of an embedded file: 64 KiB. */
export const DEFAULT_MAX_EMBEDDED_BYTES = 65536;

/**
 * This function puts the bytes of the small files into the document. A file becomes `embedded` when `files` has its
 * bytes, its size is `maxBytes` or less, and it is not linked. The caller makes sure that the bytes have the id as their
 * hash: this function has no hash. A list of bytes with a different size than its entry throws a `RangeError`.
 */
export function embedMedia(document: MediaDocument, files: ReadonlyMap<string, Uint8Array>, options: EmbedOptions = {}): MediaDocument {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_EMBEDDED_BYTES;
  let next = document;
  for (const [id, bytes] of files) {
    if (!Object.hasOwn(document.$media, id)) continue;
    const entry = document.$media[id]!;
    if (entry.state === "linked" || entry.state === "embedded" || entry.size > maxBytes) continue;
    if (bytes.length !== entry.size) throw new RangeError(`The file ${id} has ${entry.size} bytes, but the bytes to embed are ${bytes.length}`);
    next = withEntry(next, id, { ...base(entry), state: "embedded", base64: encodeBase64(bytes) });
  }
  return next;
}

/** This function sets a file to `linked`: its bytes are at the http or https URL `url`. */
export function linkMedia(document: MediaDocument, id: string, url: string): MediaDocument {
  const entry = entryOf(document, id);
  if (!isMediaUrl(url)) throw new RangeError(`The url ${JSON.stringify(url)} is not an absolute http or https URL`);
  return withEntry(document, id, { ...base(entry), state: "linked", url });
}

/**
 * This function sets the state of a stored file from the number of its bytes in the store: 0 gives `pending`, the
 * size gives `complete`, and a number between them gives `partial`. An embedded or linked file throws a `RangeError`.
 */
export function withReceived(document: MediaDocument, id: string, received: number): MediaDocument {
  const entry = entryOf(document, id);
  if (!isStored(entry)) throw new RangeError(`The file ${id} is ${entry.state}, so the store does not count its bytes`);
  if (!Number.isSafeInteger(received) || received < 0 || received > entry.size) {
    throw new RangeError(`The count ${received} of the file ${id} is not an integer from 0 to its size ${entry.size}`);
  }
  const next: MediaEntry =
    received === 0
      ? { ...base(entry), state: "pending" }
      : received === entry.size
        ? { ...base(entry), state: "complete" }
        : { ...base(entry), state: "partial", received };
  return withEntry(document, id, next);
}

/** A new file for `addMedia`. The caller gives the hash of its bytes: this package has no hash. */
export interface NewMedia {
  /** The JSON Pointer of the file in `$data`. The parent of the pointer exists. */
  readonly path: string;
  readonly type: string;
  readonly size: number;
  readonly sha256: string;
}

/**
 * This function adds a file to the document as `pending`, and puts its id at its path in `$data`. A value at the path
 * is replaced. In an array, the index of the end or `-` adds the id at the end. The result is a checked
 * document: a bad entry throws a `MediaDocumentError`.
 */
export function addMedia(document: MediaDocument, file: NewMedia): MediaDocument {
  if (!isMediaId(file.sha256)) throw new RangeError(`The hash ${JSON.stringify(file.sha256)} is not a SHA-256 in 64 lowercase hex characters`);
  const tokens = parsePointer(file.path, "path");
  const last = tokens[tokens.length - 1];
  let path = file.path;
  let op: "add" | "replace" = "add";
  if (last !== undefined) {
    const parent = lookup(document.$data, tokens.slice(0, -1));
    if (!parent.found) throw new RangeError(`The parent of the path ${JSON.stringify(file.path)} is not in $data`);
    if (Array.isArray(parent.value)) {
      // An add at an index inserts and moves the files after it, so an index that exists is replaced.
      const length = parent.value.length;
      const index = last === "-" ? length : arrayIndex(last);
      if (index === undefined || index > length) throw new RangeError(`The path ${JSON.stringify(file.path)} is not an index of its array, or "-"`);
      path = formatPointer([...tokens.slice(0, -1), index]);
      op = index < length ? "replace" : "add";
    }
  }
  const $data = applyPatch(document.$data, [{ op, path, value: file.sha256 }]);
  const entry: MediaEntry = { path, type: file.type, size: file.size, sha256: file.sha256, state: "pending" };
  return assertMediaDocument({ $media: { ...document.$media, [file.sha256]: entry }, $data });
}
