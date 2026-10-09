import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

// A fake S3 client: the next GetObject response is set by each test
let nextResponse: Record<string, unknown> = {};
vi.mock("../../s3-client.js", () => ({
  getS3Client: () => ({ send: async () => nextResponse }),
}));

const { s3Download } = await import("./download.js");

function body(content: string): Readable & { transformToByteArray: () => Promise<Uint8Array> } {
  const stream = Readable.from([Buffer.from(content)]);
  return Object.assign(stream, { transformToByteArray: async () => new Uint8Array(Buffer.from(content)) });
}

describe("s3.download (regression: BUGS-2026-07 M22)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "client-s3-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("streams the object to destPath instead of returning it", async () => {
    nextResponse = { Body: body("archive bytes"), ContentLength: 13, ETag: '"abc"' };
    const destPath = join(dir, "archive.tar.gz");

    const result = await s3Download({ bucket: "b", key: "k", destPath });

    expect(readFileSync(destPath, "utf8")).toBe("archive bytes");
    expect(result.body).toBe("");
    expect(result.path).toBe(destPath);
    expect(result.etag).toBe("abc");
  });

  it("refuses to load an object larger than maxBytes into memory", async () => {
    nextResponse = { Body: body("x".repeat(100)), ContentLength: 100 };

    await expect(s3Download({ bucket: "b", key: "k", maxBytes: 10 })).rejects.toThrow("more than maxBytes");
  });

  it("keeps the previous file when the transfer fails (deep dive DATA-14)", async () => {
    const destPath = join(dir, "archive.tar.gz");
    writeFileSync(destPath, "previous archive");
    async function* failing() {
      yield Buffer.from("partial");
      throw new Error("connection reset");
    }
    nextResponse = { Body: Readable.from(failing()), ContentLength: 100 };

    await expect(s3Download({ bucket: "b", key: "k", destPath })).rejects.toThrow("connection reset");

    expect(readFileSync(destPath, "utf8")).toBe("previous archive");
    expect(readdirSync(dir)).toEqual(["archive.tar.gz"]);
  });

  it("replaces the file when the transfer succeeds", async () => {
    const destPath = join(dir, "archive.tar.gz");
    writeFileSync(destPath, "previous archive");
    nextResponse = { Body: body("new archive"), ContentLength: 11 };

    await s3Download({ bucket: "b", key: "k", destPath });

    expect(readFileSync(destPath, "utf8")).toBe("new archive");
    expect(readdirSync(dir)).toEqual(["archive.tar.gz"]);
  });

  it("counts the bytes when Content-Length is missing or wrong (deep dive DATA-14)", async () => {
    nextResponse = { Body: body("x".repeat(100)) };
    await expect(s3Download({ bucket: "b", key: "k", maxBytes: 10 })).rejects.toThrow("more than maxBytes");

    nextResponse = { Body: body("x".repeat(100)), ContentLength: 5 };
    await expect(s3Download({ bucket: "b", key: "k", maxBytes: 10 })).rejects.toThrow("more than maxBytes");
  });

  it("applies an explicit maxBytes to a file download", async () => {
    const destPath = join(dir, "big.bin");
    nextResponse = { Body: body("x".repeat(100)) };

    await expect(s3Download({ bucket: "b", key: "k", destPath, maxBytes: 10 })).rejects.toThrow("more than maxBytes");
    expect(readdirSync(dir)).toEqual([]);
  });

  it("still returns small objects as base64 or text", async () => {
    nextResponse = { Body: body("hello"), ContentLength: 5 };
    expect((await s3Download({ bucket: "b", key: "k" })).body).toBe(Buffer.from("hello").toString("base64"));

    nextResponse = { Body: body("hello"), ContentLength: 5 };
    expect((await s3Download({ bucket: "b", key: "k", encoding: "utf8" })).body).toBe("hello");
  });
});
