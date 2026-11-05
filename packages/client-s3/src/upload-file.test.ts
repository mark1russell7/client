/**
 * The tests of `s3.upload` with `sourcePath`, with no network. A fake client takes the real commands
 * of `@aws-sdk/client-s3`, hashes each part, and keeps no part. So the peak memory of the test is
 * the memory of the upload.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, type Hash } from "node:crypto";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, truncateSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  PutObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { createRegistry, invokePath, outputValue } from "@procedures/client";

/** A record of the commands, with the hash of the parts. A hook runs before each command. */
class FakeClient {
  sent: string[] = [];
  hash: Hash = createHash("sha256");
  partSizes: number[] = [];
  partNumbers: number[] = [];
  completed: unknown[] = [];
  created: Record<string, unknown> | undefined;
  putBody: Buffer | string | undefined;
  putInput: Record<string, unknown> | undefined;
  peakArrayBuffers = 0;
  before: (name: string, partNumber: number) => void = () => undefined;

  async send(command: { input: object }): Promise<Record<string, unknown>> {
    const name = command.constructor.name;
    this.sent.push(name);
    this.peakArrayBuffers = Math.max(this.peakArrayBuffers, process.memoryUsage().arrayBuffers);
    const input = command.input as Record<string, any>;
    this.before(name, Number(input["PartNumber"] ?? 0));
    if (command instanceof PutObjectCommand) {
      this.putBody = input["Body"];
      this.putInput = input;
      return { ETag: '"put-etag"', VersionId: "v1" };
    }
    if (command instanceof CreateMultipartUploadCommand) {
      this.created = input;
      return { UploadId: "upload-1" };
    }
    if (command instanceof UploadPartCommand) {
      const body = input["Body"] as Buffer;
      this.hash.update(body);
      this.partSizes.push(body.length);
      this.partNumbers.push(input["PartNumber"]);
      return { ETag: `"part-${input["PartNumber"]}"` };
    }
    if (command instanceof CompleteMultipartUploadCommand) {
      this.completed = input["MultipartUpload"].Parts;
      return { ETag: '"whole-etag"', VersionId: "v2" };
    }
    if (command instanceof AbortMultipartUploadCommand) return {};
    throw new Error(`The fake client has no command ${name}`);
  }
}

let fake = new FakeClient();
vi.mock("./s3-client.js", () => ({ getS3Client: () => fake }));

const { s3Module } = await import("./module.js");
const { MOST_PARTS, PART_BYTES, partBytesOf, s3Upload } = await import("./procedures/s3/upload.js");

let dir: string;

beforeEach(() => {
  fake = new FakeClient();
  dir = mkdtempSync(join(tmpdir(), "s3-upload-file-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function upload(input: Record<string, unknown>): Promise<{ etag: string; versionId?: string; location: string }> {
  const registry = createRegistry(s3Module);
  return invokePath<{ etag: string; versionId?: string; location: string }>(["s3", "upload"], input, { registry }).then(outputValue);
}

/**
 * This function makes a file of `size` bytes with few written blocks: a stamp at the start of each
 * MiB. So the hash finds a part out of order, and the file does not cost memory in the test.
 */
function stampedFile(size: number): { path: string; sha256: string } {
  const path = join(dir, "big.bin");
  const file = openSync(path, "w");
  truncateSync(path, size);
  const hash = createHash("sha256");
  const mib = 1024 * 1024;
  // One block for all the stamps: garbage here could hide the memory that a test reads later
  const block = Buffer.alloc(mib);
  for (let at = 0; at < size; at += mib) {
    const stamp = Buffer.from(`at ${at}`);
    const length = Math.min(mib, size - at);
    const stamped = Math.min(stamp.length, length);
    stamp.copy(block, 0, 0, stamped);
    writeSync(file, block, 0, stamped, at);
    hash.update(block.subarray(0, length));
    block.fill(0, 0, stamped);
  }
  closeSync(file);
  return { path, sha256: hash.digest("hex") };
}

const LARGE = 5 * PART_BYTES + 123;

describe("s3.upload with sourcePath", () => {
  it("puts a file of at most one part in one command, with its content type and metadata", async () => {
    const path = join(dir, "small.txt");
    writeFileSync(path, "file bytes");
    const result = await upload({ bucket: "b", key: "k", sourcePath: path, contentType: "text/plain", metadata: { owner: "test" } });
    expect(result).toEqual({ etag: "put-etag", versionId: "v1", location: "s3://b/k" });
    expect(fake.sent).toEqual(["PutObjectCommand"]);
    expect(String(fake.putBody)).toBe("file bytes");
    expect(fake.putInput).toMatchObject({ ContentType: "text/plain", Metadata: { owner: "test" } });
  });

  it("puts an empty file", async () => {
    const path = join(dir, "empty.bin");
    writeFileSync(path, "");
    await upload({ bucket: "b", key: "k", sourcePath: path });
    expect(fake.sent).toEqual(["PutObjectCommand"]);
    expect((fake.putBody as Buffer).length).toBe(0);
  });

  it("puts a file of exactly one part in one command", async () => {
    const { path } = stampedFile(PART_BYTES);
    await upload({ bucket: "b", key: "k", sourcePath: path });
    expect(fake.sent).toEqual(["PutObjectCommand"]);
    expect((fake.putBody as Buffer).length).toBe(PART_BYTES);
  });

  it("sends a larger file in order, in parts of the stated size", async () => {
    const { path, sha256 } = stampedFile(LARGE);
    const result = await upload({ bucket: "b", key: "k", sourcePath: path, contentType: "application/gzip", metadata: { owner: "test" } });
    expect(result).toEqual({ etag: "whole-etag", versionId: "v2", location: "s3://b/k" });
    expect(fake.sent).toEqual(["CreateMultipartUploadCommand", ...Array.from({ length: 6 }, () => "UploadPartCommand"), "CompleteMultipartUploadCommand"]);
    expect(fake.created).toMatchObject({ Bucket: "b", Key: "k", ContentType: "application/gzip", Metadata: { owner: "test" } });
    expect(fake.partSizes).toEqual([PART_BYTES, PART_BYTES, PART_BYTES, PART_BYTES, PART_BYTES, 123]);
    expect(fake.partNumbers).toEqual([1, 2, 3, 4, 5, 6]);
    expect(fake.completed).toEqual([1, 2, 3, 4, 5, 6].map((PartNumber) => ({ ETag: `"part-${PartNumber}"`, PartNumber })));
    expect(fake.hash.digest("hex")).toBe(sha256);
  });

  it("holds one part in memory, not the file", async () => {
    const { path } = stampedFile(LARGE);
    const start = process.memoryUsage().arrayBuffers;
    await upload({ bucket: "b", key: "k", sourcePath: path });
    // One buffer of a part. A second part of margin is for small buffers of the file reads.
    expect(fake.peakArrayBuffers - start).toBeLessThanOrEqual(2 * PART_BYTES);
    // The control: the same measure sees the whole file in memory
    const whole = readFileSync(path);
    expect(process.memoryUsage().arrayBuffers - start).toBeGreaterThan(2 * PART_BYTES);
    expect(whole.length).toBe(LARGE);
  });

  it("aborts on a failure of a part, and keeps the error of the part", async () => {
    const { path } = stampedFile(LARGE);
    fake.before = (name, partNumber) => {
      if (name === "UploadPartCommand" && partNumber === 2) throw new Error("the part failed");
    };
    await expect(upload({ bucket: "b", key: "k", sourcePath: path })).rejects.toThrow(/the part failed/);
    expect(fake.sent.at(-1)).toBe("AbortMultipartUploadCommand");
    expect(fake.sent).not.toContain("CompleteMultipartUploadCommand");
  });

  it("aborts on a failure of the completion", async () => {
    const { path } = stampedFile(LARGE);
    fake.before = (name) => {
      if (name === "CompleteMultipartUploadCommand") throw new Error("the completion failed");
    };
    await expect(upload({ bucket: "b", key: "k", sourcePath: path })).rejects.toThrow(/the completion failed/);
    expect(fake.sent.at(-1)).toBe("AbortMultipartUploadCommand");
  });

  it("keeps the first error when the abort also fails", async () => {
    const { path } = stampedFile(LARGE);
    fake.before = (name) => {
      if (name === "UploadPartCommand") throw new Error("the part failed");
      if (name === "AbortMultipartUploadCommand") throw new Error("the abort failed");
    };
    await expect(upload({ bucket: "b", key: "k", sourcePath: path })).rejects.toThrow(/the part failed/);
    expect(fake.sent.at(-1)).toBe("AbortMultipartUploadCommand");
  });

  it("aborts when the file becomes shorter during the upload", async () => {
    const { path } = stampedFile(LARGE);
    fake.before = (name, partNumber) => {
      if (name === "UploadPartCommand" && partNumber === 1) truncateSync(path, PART_BYTES + 1);
    };
    await expect(upload({ bucket: "b", key: "k", sourcePath: path })).rejects.toThrow(/changed during the upload/);
    expect(fake.sent.at(-1)).toBe("AbortMultipartUploadCommand");
    expect(fake.sent).not.toContain("CompleteMultipartUploadCommand");
  });

  it("aborts when the file becomes longer during the upload", async () => {
    const { path } = stampedFile(LARGE);
    fake.before = (name, partNumber) => {
      if (name === "UploadPartCommand" && partNumber === 6) truncateSync(path, LARGE + 1);
    };
    await expect(upload({ bucket: "b", key: "k", sourcePath: path })).rejects.toThrow(/changed during the upload/);
    expect(fake.sent.at(-1)).toBe("AbortMultipartUploadCommand");
    expect(fake.sent).not.toContain("CompleteMultipartUploadCommand");
  });

  it("sends no command for a missing file, or for a path that is not a file", async () => {
    await expect(upload({ bucket: "b", key: "k", sourcePath: join(dir, "none.bin") })).rejects.toThrow(/ENOENT/);
    // Windows refuses to open a folder, and Linux opens it
    await expect(upload({ bucket: "b", key: "k", sourcePath: dir })).rejects.toThrow(/is not a file|EISDIR|EPERM/);
    expect(fake.sent).toEqual([]);
  });

  it("fails when S3 gives no upload id", async () => {
    const { path } = stampedFile(LARGE);
    fake.send = async () => ({});
    await expect(upload({ bucket: "b", key: "k", sourcePath: path })).rejects.toThrow(/no upload id/);
  });
});

describe("the input of s3.upload", () => {
  it("refuses a body and a sourcePath together, and neither of them", async () => {
    const path = join(dir, "a.txt");
    writeFileSync(path, "x");
    await expect(upload({ bucket: "b", key: "k", body: "x", sourcePath: path })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(upload({ bucket: "b", key: "k" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fake.sent).toEqual([]);
  });

  it("refuses base64 with a sourcePath", async () => {
    const path = join(dir, "a.txt");
    writeFileSync(path, "x");
    await expect(upload({ bucket: "b", key: "k", sourcePath: path, base64: true })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fake.sent).toEqual([]);
  });

  it("keeps the rule for a direct call of the function", async () => {
    const path = join(dir, "a.txt");
    writeFileSync(path, "x");
    await expect(s3Upload({ bucket: "b", key: "k", body: "x", sourcePath: path })).rejects.toThrow(/body or sourcePath/);
    await expect(s3Upload({ bucket: "b", key: "k" })).rejects.toThrow(/body or sourcePath/);
    expect(readFileSync(path, "utf8")).toBe("x");
  });
});

describe("partBytesOf", () => {
  it("gives the stated size up to the limit of parts", () => {
    expect(partBytesOf(0)).toBe(PART_BYTES);
    expect(partBytesOf(PART_BYTES * MOST_PARTS)).toBe(PART_BYTES);
  });

  it("gives larger parts above the limit, and never more parts than the limit", () => {
    const size = PART_BYTES * MOST_PARTS + 1;
    expect(partBytesOf(size)).toBe(PART_BYTES + 1);
    expect(Math.ceil(size / partBytesOf(size))).toBeLessThanOrEqual(MOST_PARTS);
  });
});
