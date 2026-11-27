import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  addMedia,
  checkMediaDocument,
  encodeBase64,
  embedMedia,
  linkMedia,
  mediaIds,
  missingIds,
  stripMedia,
  withReceived,
  type MediaDocument,
  type MediaIssueCode,
} from "./index.js";

const RUNS = { numRuns: 200 };

const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/** A file with random bytes and a random id. The core has no hash, so the id need not be the hash of the bytes. */
const fileArb = fc.record({
  id: fc.uint8Array({ minLength: 32, maxLength: 32 }).map(hex),
  bytes: fc.uint8Array({ maxLength: 96 }),
  type: fc.constantFrom("image/jpeg", "image/png", "application/pdf", "text/plain; charset=utf-8", "application/vnd.example+json"),
  // A name with "~" and "/" makes the escapes of the pointer (RFC 6901) part of the test.
  name: fc.option(fc.string({ unit: fc.constantFrom("a", "b", "~", "/", "0", "1", " "), minLength: 1, maxLength: 6 }), { nil: undefined }),
});

type FileValue = { readonly id: string; readonly bytes: Uint8Array; readonly type: string; readonly name: string | undefined };

const escape = (token: string): string => token.replace(/~/g, "~0").replace(/\//g, "~1");

/** A list of files with distinct ids and distinct names. */
const filesArb = fc.uniqueArray(fileArb, { maxLength: 8, selector: (file) => file.id }).map((files) => {
  const names = new Set<string>();
  return files.map((file) => {
    if (file.name === undefined || names.has(file.name)) return { ...file, name: undefined };
    names.add(file.name);
    return file;
  });
});

function build(files: readonly FileValue[]): MediaDocument {
  let document: MediaDocument = { $media: {}, $data: { title: "a record", list: [], byName: {} } };
  for (const file of files) {
    const path = file.name === undefined ? "/list/-" : `/byName/${escape(file.name)}`;
    document = addMedia(document, { path, type: file.type, size: file.bytes.length, sha256: file.id });
  }
  return document;
}

function codes(value: unknown): MediaIssueCode[] {
  const result = checkMediaDocument(value);
  return result.tag === "ok" ? [] : result.error.map((issue) => issue.code);
}

describe("media documents", () => {
  it("a built document passes the check, also after a JSON round trip", () => {
    fc.assert(
      fc.property(filesArb, (files) => {
        const document = build(files);
        expect(codes(document)).toEqual([]);
        const copy: unknown = JSON.parse(JSON.stringify(document));
        expect(codes(copy)).toEqual([]);
        expect(mediaIds(document)).toEqual(files.map((file) => file.id).sort());
      }),
      RUNS,
    );
  });

  it("strip after embed gives the pending document and the bytes of each small file", () => {
    fc.assert(
      fc.property(filesArb, fc.integer({ min: 0, max: 100 }), (files, maxBytes) => {
        const document = build(files);
        const bytes = new Map(files.map((file) => [file.id, file.bytes]));
        const embedded = embedMedia(document, bytes, { maxBytes });
        expect(codes(embedded)).toEqual([]);
        const small = files.filter((file) => file.bytes.length <= maxBytes);
        for (const file of files) expect(embedded.$media[file.id]!.state).toBe(file.bytes.length <= maxBytes ? "embedded" : "pending");
        const stripped = stripMedia(embedded);
        expect(stripped.document).toEqual(document);
        expect([...stripped.files.keys()].sort()).toEqual(small.map((file) => file.id).sort());
        for (const file of small) expect(Array.from(stripped.files.get(file.id)!)).toEqual(Array.from(file.bytes));
      }),
      RUNS,
    );
  });

  it("the missing ids are the stored files that the store does not have, in sorted order", () => {
    fc.assert(
      fc.property(filesArb, fc.func(fc.boolean()), fc.func(fc.constantFrom("embed", "link", "keep")), (files, has, kind) => {
        let document = build(files);
        const stored = new Set<string>();
        for (const file of files) {
          const choice = kind(file.id);
          if (choice === "embed") document = embedMedia(document, new Map([[file.id, file.bytes]]), { maxBytes: 1000 });
          else if (choice === "link") document = linkMedia(document, file.id, `https://example.com/${file.id}`);
          else stored.add(file.id);
        }
        expect(codes(document)).toEqual([]);
        const missing = missingIds(document, (id) => has(id));
        expect(missing).toEqual([...stored].filter((id) => !has(id)).sort());
        expect(missingIds(document, (id) => stored.has(id))).toEqual([]);
      }),
      RUNS,
    );
  });

  it("the count of received bytes sets the state, and the last count wins", () => {
    fc.assert(
      fc.property(
        filesArb.filter((files) => files.length > 0),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 5 }),
        (files, shares) => {
          const file = files[0]!;
          const size = file.bytes.length;
          let document = build(files);
          let count = 0;
          for (const share of shares) {
            count = Math.round(share * size);
            document = withReceived(document, file.id, count);
            expect(codes(document)).toEqual([]);
          }
          const entry = document.$media[file.id]!;
          expect(entry.state).toBe(count === 0 ? "pending" : count === size ? "complete" : "partial");
          if (entry.state === "partial") expect(entry.received).toBe(count);
        },
      ),
      RUNS,
    );
  });

  it("the check finds each kind of damage", () => {
    fc.assert(
      fc.property(filesArb.filter((files) => files.length > 0), (files) => {
        const document = build(files);
        const id = files[0]!.id;
        const entry = document.$media[id]!;
        const damage = (change: (copy: { $media: Record<string, Record<string, unknown>>; $data: unknown }) => void): MediaIssueCode[] => {
          const copy = JSON.parse(JSON.stringify(document)) as { $media: Record<string, Record<string, unknown>>; $data: unknown };
          change(copy);
          return codes(copy);
        };
        expect(damage((copy) => (copy.$media[id]!.sha256 = "0".repeat(64)))).toContain("ID_MISMATCH");
        expect(damage((copy) => (copy.$media[id]!.size = -1))).toContain("BAD_SIZE");
        expect(damage((copy) => (copy.$media[id]!.type = "Image/JPEG"))).toContain("BAD_TYPE");
        expect(damage((copy) => (copy.$media[id]!.state = "done"))).toContain("BAD_STATE");
        expect(damage((copy) => (copy.$media[id]!.url = "https://example.com/"))).toContain("UNKNOWN_FIELD");
        expect(damage((copy) => (copy.$media[id]!.path = "/nowhere/at/all"))).toContain("PATH_NOT_FOUND");
        expect(damage((copy) => (copy.$media[id]!.path = "no-slash"))).toContain("BAD_PATH");
        expect(damage((copy) => (copy.$data = JSON.parse(JSON.stringify(copy.$data).split(id).join("f".repeat(64)))))).toContain("PATH_NOT_ID");
        expect(damage((copy) => {
          copy.$media[id.toUpperCase()] = copy.$media[id]!;
          delete copy.$media[id];
        })).toContain("BAD_ID");
        expect(damage((copy) => (copy.$media[id] = { ...copy.$media[id]!, state: "partial", received: entry.size }))).toContain("BAD_RECEIVED");
        expect(damage((copy) => (copy.$media[id] = { ...copy.$media[id]!, state: "linked", url: "javascript:alert(1)" }))).toContain("BAD_URL");
        expect(damage((copy) => (copy.$media[id] = { ...copy.$media[id]!, state: "embedded", base64: "A" }))).toContain("BAD_BASE64");
        expect(damage((copy) => (copy.$media[id] = { ...copy.$media[id]!, state: "embedded", base64: encodeBase64(new Uint8Array(entry.size + 1)) }))).toContain("SIZE_MISMATCH");
      }),
      RUNS,
    );
  });

  it("two files at one path, a non-JSON $data and other fields are refused", () => {
    const one = "a".repeat(64);
    const two = "b".repeat(64);
    const entry = { type: "image/png", size: 1, state: "pending" };
    expect(codes({ $media: { [one]: { ...entry, path: "/x", sha256: one }, [two]: { ...entry, path: "/x", sha256: two } }, $data: { x: one } })).toContain("PATH_SHARED");
    expect(codes({ $media: {}, $data: { when: new Date(0) } })).toContain("NOT_JSON");
    expect(codes({ $media: {}, $data: {}, extra: 1 })).toEqual(["UNKNOWN_FIELD"]);
    expect(codes({ $data: {} })).toEqual(["MISSING_FIELD"]);
    expect(codes([])).toEqual(["NOT_OBJECT"]);
  });

  it("an add at an array index that exists replaces the value, so the other paths stay true", () => {
    const one = "1".repeat(64);
    const two = "2".repeat(64);
    let document: MediaDocument = { $media: {}, $data: { list: ["old", "keep"] } };
    document = addMedia(document, { path: "/list/0", type: "image/png", size: 3, sha256: one });
    document = addMedia(document, { path: "/list/-", type: "image/png", size: 4, sha256: two });
    expect(document.$data).toEqual({ list: [one, "keep", two] });
    expect(document.$media[two]!.path).toBe("/list/2");
    expect(() => addMedia(document, { path: "/list/9", type: "image/png", size: 1, sha256: "3".repeat(64) })).toThrow(RangeError);
    // A new file over the path of a file makes that file lose its path, and the check refuses it.
    expect(() => addMedia(document, { path: "/list/2", type: "image/png", size: 1, sha256: "3".repeat(64) })).toThrow(/holds/);
  });
});
