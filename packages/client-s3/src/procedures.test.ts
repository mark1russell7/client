/**
 * Each s3 procedure through a registry of `s3Module` (roadmap R33), with no network: the S3
 * client of the package is a fake S3 in memory (as in the other tests of the package, `vi.mock`
 * of `s3-client.js`). The fake takes the real commands of `@aws-sdk/client-s3`, keeps the
 * buckets in maps, and throws the real errors (`NoSuchKey`, `NoSuchBucket`, `NoSuchUpload`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchBucket,
  NoSuchKey,
  NoSuchUpload,
  NotFound,
  PutObjectCommand,
  S3ServiceException,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { createRegistry, invokePath, outputValue, type Effects, type ProcedurePath } from "@procedures/client";

// =============================================================================
// The fake S3
// =============================================================================

interface StoredObject {
  body: Buffer;
  contentType: string | undefined;
  metadata: Record<string, string> | undefined;
  etag: string;
  lastModified: Date;
}

interface Upload {
  bucket: string;
  key: string;
  contentType: string | undefined;
  parts: Map<number, { body: Buffer; etag: string }>;
}

function md5(body: Buffer): string {
  return createHash("md5").update(body).digest("hex");
}

function bodyOf(body: unknown): Buffer {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  throw new Error(`The fake S3 cannot read a body of type ${typeof body}`);
}

const $metadata = {};

/** An S3 in memory: it answers the commands of the procedures as S3 does. */
class FakeS3 {
  readonly buckets = new Map<string, Map<string, StoredObject>>();
  readonly uploads = new Map<string, Upload>();
  /** The name of each command that the client sent. */
  readonly sent: string[] = [];
  private nextUpload = 1;

  bucket(name: string): Map<string, StoredObject> {
    const bucket = this.buckets.get(name);
    if (!bucket) throw new NoSuchBucket({ message: `The bucket ${name} does not exist`, $metadata });
    return bucket;
  }

  /** A copy of the state: the objects and the uploads, for the effects tests. */
  state(): string {
    const objects = [...this.buckets].map(([name, bucket]) => [name, [...bucket].map(([key, object]) => [key, object.body.toString("base64"), object.etag])]);
    const uploads = [...this.uploads].map(([id, upload]) => [id, upload.key, [...upload.parts.keys()]]);
    return JSON.stringify({ objects, uploads });
  }

  async send(command: { input: object }): Promise<Record<string, unknown>> {
    this.sent.push(command.constructor.name);
    // Each command of the SDK has its own input type: the fake reads the fields by name
    const input = command.input as Record<string, any>;
    if (command instanceof PutObjectCommand) {
      const body = bodyOf(input["Body"]);
      const etag = md5(body);
      this.bucket(input["Bucket"]).set(input["Key"], {
        body,
        contentType: input["ContentType"],
        metadata: input["Metadata"],
        etag,
        lastModified: new Date(),
      });
      return { ETag: `"${etag}"`, $metadata };
    }
    if (command instanceof GetObjectCommand) {
      const object = this.bucket(input["Bucket"]).get(input["Key"]);
      if (!object) throw new NoSuchKey({ message: "The specified key does not exist.", $metadata });
      return {
        Body: Readable.from([object.body]),
        ContentLength: object.body.length,
        ContentType: object.contentType,
        ETag: `"${object.etag}"`,
        LastModified: object.lastModified,
        $metadata,
      };
    }
    if (command instanceof ListObjectsV2Command) {
      const prefix: string = input["Prefix"] ?? "";
      const delimiter: string | undefined = input["Delimiter"];
      const maxKeys: number = input["MaxKeys"] ?? 1000;
      const start = Number(input["ContinuationToken"] ?? 0);
      // The entries in key order: an object, or a common prefix with a delimiter
      const entries: Array<{ prefix: string } | { key: string; object: StoredObject }> = [];
      const prefixes = new Set<string>();
      for (const [key, object] of [...this.bucket(input["Bucket"])].sort(([a], [b]) => (a < b ? -1 : 1))) {
        if (!key.startsWith(prefix)) continue;
        const cut = delimiter ? key.indexOf(delimiter, prefix.length) : -1;
        if (cut >= 0) {
          const common = key.slice(0, cut + delimiter!.length);
          if (!prefixes.has(common)) {
            prefixes.add(common);
            entries.push({ prefix: common });
          }
        } else {
          entries.push({ key, object });
        }
      }
      const page = entries.slice(start, start + maxKeys);
      const truncated = start + maxKeys < entries.length;
      const contents = page.flatMap((entry) =>
        "key" in entry ? [{ Key: entry.key, Size: entry.object.body.length, ETag: `"${entry.object.etag}"`, LastModified: entry.object.lastModified, StorageClass: "STANDARD" }] : [],
      );
      return {
        Contents: contents.length > 0 ? contents : undefined,
        CommonPrefixes: page.flatMap((entry) => ("prefix" in entry ? [{ Prefix: entry.prefix }] : [])),
        IsTruncated: truncated,
        NextContinuationToken: truncated ? String(start + maxKeys) : undefined,
        KeyCount: page.length,
        $metadata,
      };
    }
    if (command instanceof DeleteObjectCommand) {
      // S3 answers 204 also for a missing key
      this.bucket(input["Bucket"]).delete(input["Key"]);
      return { $metadata };
    }
    if (command instanceof HeadObjectCommand) {
      // A HEAD answer has no body: a missing bucket and a missing key are both a 404 NotFound
      const object = this.buckets.get(input["Bucket"])?.get(input["Key"]);
      if (!object) throw new NotFound({ message: "UnknownError", $metadata: { httpStatusCode: 404 } });
      return {
        ContentLength: object.body.length,
        ContentType: object.contentType,
        ETag: `"${object.etag}"`,
        LastModified: object.lastModified,
        Metadata: object.metadata ?? {},
        $metadata,
      };
    }
    if (command instanceof CopyObjectCommand) {
      // The copy source is "bucket/key" with a URL-encoded key, and maybe "?versionId=..."
      const source = String(input["CopySource"]).split("?")[0]!;
      const cut = source.indexOf("/");
      const sourceKey = decodeURIComponent(source.slice(cut + 1));
      const original = this.bucket(source.slice(0, cut)).get(sourceKey);
      if (!original) throw new NoSuchKey({ message: "The specified key does not exist.", $metadata });
      const target = this.bucket(input["Bucket"]);
      if (input["IfNoneMatch"] === "*" && target.has(input["Key"])) {
        throw new S3ServiceException({ name: "PreconditionFailed", $fault: "client", message: "At least one of the pre-conditions you specified did not hold", $metadata: { httpStatusCode: 412 } });
      }
      const replace = input["MetadataDirective"] === "REPLACE";
      const copy: StoredObject = {
        body: Buffer.from(original.body),
        contentType: replace ? input["ContentType"] : original.contentType,
        metadata: replace ? input["Metadata"] : original.metadata,
        etag: original.etag,
        lastModified: new Date(),
      };
      target.set(input["Key"], copy);
      return { CopyObjectResult: { ETag: `"${copy.etag}"`, LastModified: copy.lastModified }, $metadata };
    }
    if (command instanceof CreateMultipartUploadCommand) {
      this.bucket(input["Bucket"]);
      const id = `upload-${this.nextUpload++}`;
      this.uploads.set(id, { bucket: input["Bucket"], key: input["Key"], contentType: input["ContentType"], parts: new Map() });
      return { UploadId: id, Bucket: input["Bucket"], Key: input["Key"], $metadata };
    }
    if (command instanceof UploadPartCommand) {
      const upload = this.upload(input["UploadId"]);
      const body = bodyOf(input["Body"]);
      const etag = md5(body);
      upload.parts.set(input["PartNumber"], { body, etag });
      return { ETag: `"${etag}"`, $metadata };
    }
    if (command instanceof CompleteMultipartUploadCommand) {
      const upload = this.upload(input["UploadId"]);
      const parts = (input["MultipartUpload"] as { Parts: Array<{ ETag: string; PartNumber: number }> }).Parts;
      const bodies: Buffer[] = [];
      parts.forEach((part, index) => {
        if (index > 0 && part.PartNumber <= parts[index - 1]!.PartNumber) {
          throw new S3ServiceException({ name: "InvalidPartOrder", $fault: "client", message: "The parts are not in ascending order", $metadata });
        }
        const stored = upload.parts.get(part.PartNumber);
        if (!stored || `"${stored.etag}"` !== part.ETag) {
          throw new S3ServiceException({ name: "InvalidPart", $fault: "client", message: `Part ${part.PartNumber} is not valid`, $metadata });
        }
        bodies.push(stored.body);
      });
      const body = Buffer.concat(bodies);
      const etag = `${md5(body)}-${parts.length}`;
      this.bucket(upload.bucket).set(upload.key, { body, contentType: upload.contentType, metadata: undefined, etag, lastModified: new Date() });
      this.uploads.delete(input["UploadId"]);
      return { Location: `https://${upload.bucket}.s3.amazonaws.com/${upload.key}`, Bucket: upload.bucket, Key: upload.key, ETag: `"${etag}"`, $metadata };
    }
    if (command instanceof AbortMultipartUploadCommand) {
      this.upload(input["UploadId"]);
      this.uploads.delete(input["UploadId"]);
      return { $metadata };
    }
    throw new Error(`The fake S3 has no command ${command.constructor.name}`);
  }

  private upload(id: string): Upload {
    const upload = this.uploads.get(id);
    if (!upload) throw new NoSuchUpload({ message: "The specified upload does not exist.", $metadata });
    return upload;
  }
}

let s3 = new FakeS3();
vi.mock("./s3-client.js", () => ({
  getS3Client: () => s3,
}));

const { s3Module } = await import("./module.js");
const registry = createRegistry(s3Module);

async function call<T>(path: ProcedurePath, input: unknown): Promise<T> {
  return outputValue(await invokePath<T>(path, input, { registry }), path);
}

let dir: string;

beforeEach(() => {
  s3 = new FakeS3();
  s3.buckets.set("b", new Map());
  dir = mkdtempSync(join(tmpdir(), "client-s3-procedures-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** This function puts objects into bucket b, with the fake (not a procedure under test). */
async function seed(...keys: string[]): Promise<void> {
  for (const key of keys) await s3.send(new PutObjectCommand({ Bucket: "b", Key: key, Body: `content of ${key}` }));
  s3.sent.length = 0;
}

// =============================================================================
// The procedures
// =============================================================================

describe("s3.upload", () => {
  it("puts a text object, with its content type and metadata", async () => {
    const result = await call<{ etag: string; location: string }>(["s3", "upload"], {
      bucket: "b",
      key: "docs/a.json",
      body: '{"a":1}',
      contentType: "application/json",
      metadata: { owner: "test" },
    });
    expect(result).toEqual({ etag: md5(Buffer.from('{"a":1}')), location: "s3://b/docs/a.json" });
    const stored = s3.buckets.get("b")!.get("docs/a.json")!;
    expect(stored.body.toString()).toBe('{"a":1}');
    expect(stored).toMatchObject({ contentType: "application/json", metadata: { owner: "test" } });
    expect(s3.sent).toEqual(["PutObjectCommand"]);
  });

  it("decodes a base64 body into bytes", async () => {
    const bytes = Buffer.from([0, 1, 2, 255]);
    await call(["s3", "upload"], { bucket: "b", key: "bin", body: bytes.toString("base64"), base64: true });
    expect(s3.buckets.get("b")!.get("bin")!.body.equals(bytes)).toBe(true);
  });

  it("fails for a missing bucket, and validates its input", async () => {
    await expect(call(["s3", "upload"], { bucket: "missing", key: "k", body: "x" })).rejects.toBeInstanceOf(NoSuchBucket);
    await expect(call(["s3", "upload"], { bucket: "b", body: "x" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(s3.sent).toEqual(["PutObjectCommand"]);
  });
});

describe("s3.download", () => {
  it("gives an object as base64, or as text with an encoding", async () => {
    await seed("a.txt");
    const binary = await call<{ body: string; contentLength: number; etag: string }>(["s3", "download"], { bucket: "b", key: "a.txt" });
    expect(Buffer.from(binary.body, "base64").toString()).toBe("content of a.txt");
    expect(binary.contentLength).toBe(16);
    expect(binary.etag).toBe(md5(Buffer.from("content of a.txt")));
    const text = await call<{ body: string; lastModified: string }>(["s3", "download"], { bucket: "b", key: "a.txt", encoding: "utf8" });
    expect(text.body).toBe("content of a.txt");
    expect(new Date(text.lastModified).toISOString()).toBe(text.lastModified);
  });

  it("writes an object to destPath", async () => {
    await seed("a.txt");
    const destPath = join(dir, "a.txt");
    const result = await call<{ body: string; path: string }>(["s3", "download"], { bucket: "b", key: "a.txt", destPath });
    expect(result).toMatchObject({ body: "", path: destPath });
    expect(readFileSync(destPath, "utf8")).toBe("content of a.txt");
  });

  it("fails with NoSuchKey for a missing key, and writes no file", async () => {
    const destPath = join(dir, "missing.txt");
    await expect(call(["s3", "download"], { bucket: "b", key: "missing", destPath })).rejects.toBeInstanceOf(NoSuchKey);
    expect(existsSync(destPath)).toBe(false);
  });

  it("refuses a maxBytes that is not a positive integer", async () => {
    await expect(call(["s3", "download"], { bucket: "b", key: "k", maxBytes: 0 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(call(["s3", "download"], { bucket: "b", key: "k", maxBytes: 1.5 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("s3.list and s3.listAll", () => {
  it("lists one page, with the token of the next page", async () => {
    await seed("a/1", "a/2", "a/3", "b/1");
    const first = await call<{ contents: Array<{ key: string; size: number }>; isTruncated: boolean; nextContinuationToken?: string; keyCount: number }>(
      ["s3", "list"],
      { bucket: "b", prefix: "a/", maxKeys: 2 },
    );
    expect(first.contents.map((object) => object.key)).toEqual(["a/1", "a/2"]);
    expect(first).toMatchObject({ isTruncated: true, keyCount: 2 });
    expect(first.contents[0]?.size).toBe("content of a/1".length);
    const second = await call<{ contents: Array<{ key: string }>; isTruncated: boolean }>(["s3", "list"], {
      bucket: "b",
      prefix: "a/",
      maxKeys: 2,
      continuationToken: first.nextContinuationToken,
    });
    expect(second.contents.map((object) => object.key)).toEqual(["a/3"]);
    expect(second.isTruncated).toBe(false);
  });

  it("gives the common prefixes with a delimiter", async () => {
    await seed("data/2024/x", "data/2025/y", "data/top");
    const result = await call<{ contents: Array<{ key: string }>; commonPrefixes: string[] }>(["s3", "list"], { bucket: "b", prefix: "data/", delimiter: "/" });
    expect(result.commonPrefixes).toEqual(["data/2024/", "data/2025/"]);
    expect(result.contents.map((object) => object.key)).toEqual(["data/top"]);
  });

  it("gives an empty page for an empty bucket", async () => {
    expect(await call(["s3", "list"], { bucket: "b" })).toMatchObject({ contents: [], commonPrefixes: [], isTruncated: false, keyCount: 0 });
  });

  it("listAll follows the pages to the end", async () => {
    await seed("k1", "k2", "k3", "k4", "k5");
    const result = await call<{ contents: Array<{ key: string }>; keyCount: number; pageCount: number }>(["s3", "listAll"], { bucket: "b", maxKeys: 2 });
    expect(result.contents.map((object) => object.key)).toEqual(["k1", "k2", "k3", "k4", "k5"]);
    expect(result).toMatchObject({ keyCount: 5, pageCount: 3 });
    expect(s3.sent).toEqual(["ListObjectsV2Command", "ListObjectsV2Command", "ListObjectsV2Command"]);
  });

  it("fails for a missing bucket", async () => {
    await expect(call(["s3", "list"], { bucket: "missing" })).rejects.toBeInstanceOf(NoSuchBucket);
    await expect(call(["s3", "listAll"], { bucket: "missing" })).rejects.toBeInstanceOf(NoSuchBucket);
  });
});

describe("s3.delete", () => {
  it("deletes an object, and succeeds for a missing key as S3 does", async () => {
    await seed("a.txt");
    expect(await call(["s3", "delete"], { bucket: "b", key: "a.txt" })).toEqual({ deleted: true });
    expect(s3.buckets.get("b")!.has("a.txt")).toBe(false);
    expect(await call(["s3", "delete"], { bucket: "b", key: "a.txt" })).toEqual({ deleted: true });
  });

  it("fails for a missing bucket, and validates its input", async () => {
    await expect(call(["s3", "delete"], { bucket: "missing", key: "k" })).rejects.toBeInstanceOf(NoSuchBucket);
    await expect(call(["s3", "delete"], { bucket: "b" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("s3.head (R44)", () => {
  it("gives the metadata of an object without its content", async () => {
    await call(["s3", "upload"], { bucket: "b", key: "doc.json", body: '{"a":1}', contentType: "application/json", metadata: { owner: "me" } });
    s3.sent.length = 0;
    const head = await call<Record<string, unknown>>(["s3", "head"], { bucket: "b", key: "doc.json" });
    expect(head).toMatchObject({ exists: true, contentLength: 7, contentType: "application/json", etag: md5(Buffer.from('{"a":1}')), metadata: { owner: "me" } });
    expect(new Date(head["lastModified"] as string).toISOString()).toBe(head["lastModified"]);
    expect(s3.sent).toEqual(["HeadObjectCommand"]);
  });

  it("gives exists: false for a missing key and a missing bucket (a 404)", async () => {
    expect(await call(["s3", "head"], { bucket: "b", key: "missing" })).toEqual({ exists: false });
    expect(await call(["s3", "head"], { bucket: "missing", key: "k" })).toEqual({ exists: false });
  });

  it("passes on an error that is not a 404, and validates its input", async () => {
    const original = s3.send.bind(s3);
    s3.send = async () => {
      throw new S3ServiceException({ name: "AccessDenied", $fault: "client", message: "Access Denied", $metadata: { httpStatusCode: 403 } });
    };
    await expect(call(["s3", "head"], { bucket: "b", key: "k" })).rejects.toThrow("Access Denied");
    s3.send = original;
    await expect(call(["s3", "head"], { bucket: "b", key: "" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("s3.copy (R44)", () => {
  it("copies an object in its bucket, with its metadata", async () => {
    await call(["s3", "upload"], { bucket: "b", key: "dir/a b.txt", body: "hello", contentType: "text/plain", metadata: { k: "v" } });
    const result = await call<Record<string, unknown>>(["s3", "copy"], { bucket: "b", sourceKey: "dir/a b.txt", key: "copy.txt" });
    expect(result).toMatchObject({ etag: md5(Buffer.from("hello")), location: "s3://b/copy.txt" });
    expect(typeof result["lastModified"]).toBe("string");
    const copy = s3.buckets.get("b")!.get("copy.txt")!;
    expect(copy.body.toString()).toBe("hello");
    expect(copy).toMatchObject({ contentType: "text/plain", metadata: { k: "v" } });
  });

  it("copies into another bucket, and replaces the metadata with contentType or metadata", async () => {
    await seed("a.txt");
    s3.buckets.set("other", new Map());
    await call(["s3", "copy"], { sourceBucket: "b", sourceKey: "a.txt", bucket: "other", key: "a.txt", contentType: "text/csv", metadata: { n: "1" } });
    expect(s3.buckets.get("other")!.get("a.txt")).toMatchObject({ contentType: "text/csv", metadata: { n: "1" } });
    expect(s3.buckets.get("b")!.has("a.txt")).toBe(true);
  });

  it("replaces the destination, unless overwrite is false", async () => {
    await seed("a.txt", "b.txt");
    await call(["s3", "copy"], { bucket: "b", sourceKey: "a.txt", key: "b.txt" });
    expect(s3.buckets.get("b")!.get("b.txt")!.body.toString()).toBe("content of a.txt");
    await expect(call(["s3", "copy"], { bucket: "b", sourceKey: "a.txt", key: "b.txt", overwrite: false })).rejects.toMatchObject({ name: "PreconditionFailed" });
    await call(["s3", "copy"], { bucket: "b", sourceKey: "a.txt", key: "new.txt", overwrite: false });
    expect(s3.buckets.get("b")!.has("new.txt")).toBe(true);
  });

  it("fails for a missing source, and sends the version id of the source", async () => {
    await expect(call(["s3", "copy"], { bucket: "b", sourceKey: "missing", key: "x" })).rejects.toBeInstanceOf(NoSuchKey);
    await seed("a.txt");
    const sent: string[] = [];
    const original = s3.send.bind(s3);
    s3.send = async (command: { input: object }) => {
      sent.push(String((command.input as Record<string, unknown>)["CopySource"]));
      return original(command);
    };
    await call(["s3", "copy"], { bucket: "b", sourceKey: "a.txt", sourceVersionId: "v 1", key: "x" });
    s3.send = original;
    expect(sent).toEqual(["b/a.txt?versionId=v%201"]);
  });
});

describe("s3.multipart.*", () => {
  it("uploads the parts, in any order, and completes the object", async () => {
    const init = await call<{ uploadId: string; bucket: string; key: string }>(["s3", "multipart", "init"], { bucket: "b", key: "big.bin", contentType: "application/octet-stream" });
    expect(init).toMatchObject({ bucket: "b", key: "big.bin" });
    const second = await call<{ etag: string; partNumber: number }>(["s3", "multipart", "upload"], {
      bucket: "b",
      key: "big.bin",
      uploadId: init.uploadId,
      partNumber: 2,
      body: Buffer.from("world").toString("base64"),
    });
    const first = await call<{ etag: string; partNumber: number }>(["s3", "multipart", "upload"], {
      bucket: "b",
      key: "big.bin",
      uploadId: init.uploadId,
      partNumber: 1,
      body: Buffer.from("hello ").toString("base64"),
    });
    expect(first).toEqual({ etag: md5(Buffer.from("hello ")), partNumber: 1 });
    const done = await call<{ location: string; etag: string }>(["s3", "multipart", "complete"], {
      bucket: "b",
      key: "big.bin",
      uploadId: init.uploadId,
      parts: [second, first],
    });
    expect(done.location).toBe("https://b.s3.amazonaws.com/big.bin");
    expect(done.etag).toMatch(/-2$/);
    expect(s3.buckets.get("b")!.get("big.bin")!.body.toString()).toBe("hello world");
    expect(s3.uploads.size).toBe(0);
  });

  it("aborts an upload", async () => {
    const init = await call<{ uploadId: string }>(["s3", "multipart", "init"], { bucket: "b", key: "k" });
    expect(await call(["s3", "multipart", "abort"], { bucket: "b", key: "k", uploadId: init.uploadId })).toEqual({ aborted: true });
    expect(s3.uploads.size).toBe(0);
    expect(s3.buckets.get("b")!.has("k")).toBe(false);
  });

  it("fails for an unknown upload, and for a part that S3 does not have", async () => {
    await expect(call(["s3", "multipart", "upload"], { bucket: "b", key: "k", uploadId: "nope", partNumber: 1, body: "" })).rejects.toBeInstanceOf(NoSuchUpload);
    await expect(call(["s3", "multipart", "abort"], { bucket: "b", key: "k", uploadId: "nope" })).rejects.toBeInstanceOf(NoSuchUpload);
    const init = await call<{ uploadId: string }>(["s3", "multipart", "init"], { bucket: "b", key: "k" });
    await expect(
      call(["s3", "multipart", "complete"], { bucket: "b", key: "k", uploadId: init.uploadId, parts: [{ partNumber: 1, etag: "wrong" }] }),
    ).rejects.toThrow("Part 1 is not valid");
    expect(s3.buckets.get("b")!.has("k")).toBe(false);
  });

  it("refuses a part number outside 1 to 10000", async () => {
    for (const partNumber of [0, 10001]) {
      await expect(call(["s3", "multipart", "upload"], { bucket: "b", key: "k", uploadId: "u", partNumber, body: "" })).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    }
    expect(s3.sent).toEqual([]);
  });

  it("init fails for a missing bucket", async () => {
    await expect(call(["s3", "multipart", "init"], { bucket: "missing", key: "k" })).rejects.toBeInstanceOf(NoSuchBucket);
  });
});

// =============================================================================
// The declared effects against what each procedure does
// =============================================================================

/** The declaration of each procedure, as `metadata.effects` gives it. */
const DECLARED: Record<string, Effects> = {
  "s3.upload": { reads: ["s3", "network"], writes: ["s3", "network"] },
  "s3.download": { reads: ["s3", "network"], writes: ["fs"], idempotent: true },
  "s3.list": { reads: ["s3", "network"], writes: [] },
  "s3.listAll": { reads: ["s3", "network"], writes: [] },
  "s3.delete": { reads: ["s3", "network"], writes: ["s3", "network"] },
  "s3.multipart.init": { reads: ["s3", "network"], writes: ["s3", "network"], destructive: false },
  "s3.multipart.upload": { reads: ["s3", "network"], writes: ["s3", "network"], idempotent: true },
  "s3.multipart.complete": { reads: ["s3", "network"], writes: ["s3", "network"] },
  "s3.multipart.abort": { reads: ["s3", "network"], writes: ["s3", "network"] },
  "s3.head": { reads: ["s3", "network"], writes: [] },
  "s3.copy": { reads: ["s3", "network"], writes: ["s3", "network"], destructive: true, idempotent: true },
  "s3.presign": { reads: ["fs", "network"], writes: [] },
};

/**
 * The procedures that the loop below does not run against the fake: s3.presign sends no request,
 * and it needs a real S3 client (presign.test.ts has its tests).
 */
const NO_REQUEST = new Set(["s3.presign"]);

/** An input for each procedure, in a bucket with the object `a.txt` and the upload `upload-1`. */
function effectsInput(key: string): Record<string, unknown> {
  const upload = { bucket: "b", key: "big", uploadId: "upload-1" };
  switch (key) {
    case "s3.upload":
      return { bucket: "b", key: "new.txt", body: "new" };
    case "s3.download":
      return { bucket: "b", key: "a.txt", destPath: join(dir, "a.txt") };
    case "s3.delete":
      return { bucket: "b", key: "a.txt" };
    case "s3.multipart.init":
      return { bucket: "b", key: "a.txt" };
    case "s3.multipart.upload":
      return { ...upload, partNumber: 2, body: Buffer.from("part two").toString("base64") };
    case "s3.multipart.complete":
      return { ...upload, parts: [{ partNumber: 1, etag: md5(Buffer.from("part one")) }] };
    case "s3.multipart.abort":
      return upload;
    case "s3.head":
      return { bucket: "b", key: "a.txt" };
    case "s3.copy":
      return { bucket: "b", sourceKey: "a.txt", key: "a-copy.txt" };
    default:
      return { bucket: "b" };
  }
}

describe("the effects of the s3 procedures", () => {
  beforeEach(async () => {
    await seed("a.txt");
    await s3.send(new CreateMultipartUploadCommand({ Bucket: "b", Key: "big" }));
    await s3.send(new UploadPartCommand({ Bucket: "b", Key: "big", UploadId: "upload-1", PartNumber: 1, Body: "part one" }));
    s3.sent.length = 0;
  });

  it("are declared for each procedure of the module", () => {
    const declared = Object.fromEntries(s3Module.procedures.map((procedure) => [procedure.path.join("."), procedure.metadata.effects]));
    expect(declared).toEqual(DECLARED);
  });

  for (const [key, effects] of Object.entries(DECLARED)) {
    if (NO_REQUEST.has(key)) continue;
    const changesS3 = effects.writes?.includes("s3") === true;
    it(`${key} ${changesS3 ? "changes the bucket" : "leaves the bucket as it is"}, and sends its request to S3`, async () => {
      const path = key.split(".");
      const before = s3.state();
      await call(path, effectsInput(key));
      const after = s3.state();
      if (changesS3) expect(after).not.toEqual(before);
      else expect(after).toEqual(before);
      // Each call reaches S3: the network of the declaration
      expect(s3.sent.length).toBeGreaterThan(0);
      if (effects.idempotent) {
        await call(path, effectsInput(key));
        expect(s3.state()).toEqual(after);
      }
    });
  }

  it("s3.download writes only the file of destPath (fs)", async () => {
    await call(["s3", "download"], effectsInput("s3.download"));
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("content of a.txt");
    await call(["s3", "download"], { bucket: "b", key: "a.txt" });
    expect(existsSync(join(dir, "a.txt.part"))).toBe(false);
  });

  it("s3.multipart.init is not destructive: the object of the key stays until the completion", async () => {
    await call(["s3", "multipart", "init"], effectsInput("s3.multipart.init"));
    expect(s3.buckets.get("b")!.get("a.txt")!.body.toString()).toBe("content of a.txt");
  });
});
