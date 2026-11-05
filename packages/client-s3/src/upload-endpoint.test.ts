/**
 * The tests of `s3.upload` with `sourcePath` through the real S3 client and a custom endpoint, as
 * `S3_ENDPOINT` sets it. This file has two services. A small HTTP server in the test runs in each
 * job and answers S3 requests, so the tests read the bytes and the headers on the wire. MinIO runs
 * in the job `checks` of `ci.yml`, as `S3_TEST_ENDPOINT` says, and shows that a real service takes
 * these requests. Without `S3_TEST_ENDPOINT`, the MinIO tests do not run.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { closeSync, mkdtempSync, openSync, rmSync, truncateSync, writeFileSync, writeSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CreateBucketCommand, GetObjectCommand, HeadObjectCommand, ListMultipartUploadsCommand } from "@aws-sdk/client-s3";
import { getS3Client, resetS3Client } from "./s3-client.js";
import { PART_BYTES, s3Upload } from "./procedures/s3/upload.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "s3-upload-endpoint-"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetS3Client();
  rmSync(dir, { recursive: true, force: true });
});

function useEndpoint(endpoint: string, accessKey: string, secretKey: string): void {
  vi.stubEnv("S3_ENDPOINT", endpoint);
  vi.stubEnv("AWS_ACCESS_KEY_ID", accessKey);
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", secretKey);
  vi.stubEnv("AWS_REGION", "us-east-1");
  resetS3Client();
}

function sha256(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

/** This function makes a file whose bytes differ from part to part, and gives its hash. */
function fileOf(size: number, name: string): { path: string; hash: string } {
  const path = join(dir, name);
  const file = openSync(path, "w");
  truncateSync(path, size);
  const content = Buffer.alloc(size);
  for (let at = 0; at < size; at += 1024 * 1024) {
    const stamp = Buffer.from(`at ${at}`);
    stamp.copy(content, at);
    writeSync(file, stamp, 0, Math.min(stamp.length, size - at), at);
  }
  closeSync(file);
  return { path, hash: sha256(content) };
}

interface Seen {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: IncomingMessage["headers"];
  readonly body: Buffer;
}

describe("s3.upload against an HTTP server in the test", () => {
  let server: Server;
  let seen: Seen[] = [];
  /** A part number that the server refuses, with a status that the client does not retry. */
  let refusedPart: number | undefined;

  const answer = (response: ServerResponse, status: number, text: string, headers: Record<string, string> = {}): void => {
    response.writeHead(status, { "content-type": "application/xml", ...headers });
    response.end(text);
  };

  beforeAll(async () => {
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const url = new URL(request.url ?? "/", "http://localhost");
        const body = Buffer.concat(chunks);
        seen.push({ method: request.method ?? "", path: url.pathname, query: url.searchParams, headers: request.headers, body });
        const part = url.searchParams.get("partNumber");
        if (request.method === "POST" && url.searchParams.has("uploads")) {
          answer(response, 200, "<InitiateMultipartUploadResult><Bucket>b</Bucket><Key>k</Key><UploadId>u1</UploadId></InitiateMultipartUploadResult>");
        } else if (request.method === "PUT" && part !== null && Number(part) === refusedPart) {
          answer(response, 403, "<Error><Code>AccessDenied</Code><Message>The part is refused</Message></Error>");
        } else if (request.method === "PUT") {
          answer(response, 200, "", { etag: `"${part === null ? "put" : `part-${part}`}"` });
        } else if (request.method === "POST") {
          answer(response, 200, '<CompleteMultipartUploadResult><Bucket>b</Bucket><Key>k</Key><ETag>"whole-2"</ETag></CompleteMultipartUploadResult>');
        } else if (request.method === "DELETE") {
          answer(response, 204, "");
        } else {
          answer(response, 500, "<Error><Code>InternalError</Code><Message>The server has no such request</Message></Error>");
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    seen = [];
    refusedPart = undefined;
    useEndpoint(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, "test-access", "test-secret-key");
  });

  it("sends a small file as plain bytes in one put, at the path of the bucket", async () => {
    const path = join(dir, "small.txt");
    writeFileSync(path, "file bytes");
    const result = await s3Upload({ bucket: "b", key: "k", sourcePath: path, contentType: "text/plain", metadata: { owner: "test" } });
    expect(result.etag).toBe("put");
    expect(seen.map((request) => [request.method, request.path])).toEqual([["PUT", "/b/k"]]);
    expect(seen[0]!.body.toString()).toBe("file bytes");
    expect(seen[0]!.headers).toMatchObject({ "content-type": "text/plain", "x-amz-meta-owner": "test" });
    expect(seen[0]!.headers["content-encoding"]).toBeUndefined();
  });

  it("sends a large file as plain bytes in parts, in order, and completes the upload", async () => {
    const size = PART_BYTES + 1000;
    const { path, hash } = fileOf(size, "big.bin");
    const result = await s3Upload({ bucket: "b", key: "k", sourcePath: path, metadata: { owner: "test" } });
    expect(result).toMatchObject({ etag: "whole-2", location: "s3://b/k" });
    expect(seen.map((request) => request.method)).toEqual(["POST", "PUT", "PUT", "POST"]);
    expect(seen[0]!.query.has("uploads")).toBe(true);
    expect(seen[0]!.headers).toMatchObject({ "x-amz-meta-owner": "test" });
    const parts = seen.slice(1, 3);
    expect(parts.map((request) => request.query.get("partNumber"))).toEqual(["1", "2"]);
    expect(parts.map((request) => request.body.length)).toEqual([PART_BYTES, 1000]);
    for (const part of parts) expect(part.headers["content-encoding"]).toBeUndefined();
    expect(sha256(Buffer.concat(parts.map((request) => request.body)))).toBe(hash);
    expect(seen[3]!.query.get("uploadId")).toBe("u1");
    const completion = seen[3]!.body.toString();
    expect(completion.indexOf("part-1")).toBeGreaterThan(-1);
    expect(completion.indexOf("part-2")).toBeGreaterThan(completion.indexOf("part-1"));
  });

  it("aborts the upload when the service refuses a part, and gives the error of the service", async () => {
    refusedPart = 2;
    const { path } = fileOf(PART_BYTES + 1000, "big.bin");
    await expect(s3Upload({ bucket: "b", key: "k", sourcePath: path })).rejects.toMatchObject({ name: "AccessDenied" });
    expect(seen.map((request) => request.method)).toEqual(["POST", "PUT", "PUT", "DELETE"]);
    expect(seen[3]!.query.get("uploadId")).toBe("u1");
  });
});

const endpoint = process.env["S3_TEST_ENDPOINT"];

describe.skipIf(endpoint === undefined)("s3.upload against MinIO", () => {
  const bucket = `s3-upload-${process.pid}`;

  beforeEach(async () => {
    useEndpoint(endpoint!, process.env["S3_TEST_ACCESS_KEY"]!, process.env["S3_TEST_SECRET_KEY"]!);
    await getS3Client()
      .send(new CreateBucketCommand({ Bucket: bucket }))
      .catch((error: { name?: string }) => {
        if (error.name !== "BucketAlreadyOwnedByYou") throw error;
      });
  });

  async function objectHash(key: string): Promise<string> {
    const response = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return sha256(Buffer.from(await response.Body!.transformToByteArray()));
  }

  it("stores a small file", async () => {
    const path = join(dir, "small.txt");
    writeFileSync(path, "file bytes");
    await s3Upload({ bucket, key: "small", sourcePath: path, contentType: "text/plain" });
    expect(await objectHash("small")).toBe(sha256(Buffer.from("file bytes")));
  });

  it("stores a large file whole, with its content type and metadata, and leaves no upload", async () => {
    const { path, hash } = fileOf(2 * PART_BYTES + 1000, "big.bin");
    const result = await s3Upload({ bucket, key: "big", sourcePath: path, contentType: "application/gzip", metadata: { owner: "test" } });
    // A multipart object has an ETag that ends in its number of parts
    expect(result.etag).toMatch(/-3$/);
    expect(await objectHash("big")).toBe(hash);
    const head = await getS3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: "big" }));
    expect(head).toMatchObject({ ContentType: "application/gzip", Metadata: { owner: "test" } });
    const open = await getS3Client().send(new ListMultipartUploadsCommand({ Bucket: bucket }));
    expect(open.Uploads ?? []).toEqual([]);
  });
});
