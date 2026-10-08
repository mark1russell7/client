import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

  it("still returns small objects as base64 or text", async () => {
    nextResponse = { Body: body("hello"), ContentLength: 5 };
    expect((await s3Download({ bucket: "b", key: "k" })).body).toBe(Buffer.from("hello").toString("base64"));

    nextResponse = { Body: body("hello"), ContentLength: 5 };
    expect((await s3Download({ bucket: "b", key: "k", encoding: "utf8" })).body).toBe("hello");
  });
});
