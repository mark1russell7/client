/**
 * s3.presign (roadmap R44): a real S3 client with fixed fake credentials signs the URLs. The
 * procedure sends no request, so the test needs no network and no fake S3. The test checks the
 * shape of each URL: the host, the path, the expiry and the signature.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRegistry, invokePath, outputValue, type Capability, type ProcedurePath } from "@procedures/client";
import { s3Module } from "../../module.js";
import { resetS3Client } from "../../s3-client.js";
import { permitsUpload } from "./presign.js";
import type { S3PresignOutput } from "../../types.js";

const ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE";
const ENV_NAMES = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_REGION", "S3_ENDPOINT"] as const;
const saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));

const registry = createRegistry(s3Module);
const path: ProcedurePath = ["s3", "presign"];

async function presign(input: unknown, capability?: Capability): Promise<S3PresignOutput> {
  return outputValue(await invokePath<S3PresignOutput>(path, input, { registry, capability }), path);
}

beforeEach(() => {
  process.env["AWS_ACCESS_KEY_ID"] = ACCESS_KEY;
  process.env["AWS_SECRET_ACCESS_KEY"] = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
  process.env["AWS_REGION"] = "eu-west-1";
  delete process.env["AWS_SESSION_TOKEN"];
  delete process.env["S3_ENDPOINT"];
  resetS3Client();
});

afterEach(() => {
  resetS3Client();
});

afterAll(() => {
  for (const name of ENV_NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

/** The parts of a presigned URL that the tests examine. */
function parts(url: string): { host: string; pathname: string; query: URLSearchParams } {
  const parsed = new URL(url);
  return { host: parsed.host, pathname: parsed.pathname, query: parsed.searchParams };
}

describe("s3.presign (R44)", () => {
  it("signs a GET URL with the default expiry of 900 seconds", async () => {
    const result = await presign({ bucket: "my-bucket", key: "dir/a b.txt" });
    const { host, pathname, query } = parts(result.url);
    expect(host).toBe("my-bucket.s3.eu-west-1.amazonaws.com");
    expect(pathname).toBe("/dir/a%20b.txt");
    expect(query.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(query.get("X-Amz-Expires")).toBe("900");
    expect(query.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(query.get("X-Amz-Credential")).toMatch(new RegExp(`^${ACCESS_KEY}/\\d{8}/eu-west-1/s3/aws4_request$`));
    expect(query.get("X-Amz-SignedHeaders")).toBe("host");
    expect(query.get("x-id")).toBe("GetObject");
    expect(result).toMatchObject({ method: "GET", expiresIn: 900 });
    // The URL expires expiresIn seconds after the time of its signature
    const signedAt = query.get("X-Amz-Date")!.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6.000Z");
    expect(new Date(result.expiresAt).getTime() - new Date(signedAt).getTime()).toBe(900_000);
  });

  it("signs a PUT URL with an expiry, and a GET URL of a version", async () => {
    const put = await presign({ bucket: "b", key: "upload.bin", method: "PUT", expiresIn: 60, contentType: "application/octet-stream" });
    const { query } = parts(put.url);
    expect(query.get("x-id")).toBe("PutObject");
    expect(query.get("X-Amz-Expires")).toBe("60");
    expect(query.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(put).toMatchObject({ method: "PUT", expiresIn: 60 });
    const version = await presign({ bucket: "b", key: "k", versionId: "v1" });
    expect(parts(version.url).query.get("versionId")).toBe("v1");
  });

  it("gives two different signatures for two keys", async () => {
    const one = parts((await presign({ bucket: "b", key: "one" })).url).query.get("X-Amz-Signature");
    const two = parts((await presign({ bucket: "b", key: "two" })).url).query.get("X-Amz-Signature");
    expect(one).not.toBe(two);
  });

  it("uses the path style with S3_ENDPOINT (MinIO, LocalStack)", async () => {
    process.env["S3_ENDPOINT"] = "http://localhost:9000";
    resetS3Client();
    const { host, pathname } = parts((await presign({ bucket: "b", key: "k.txt" })).url);
    expect(host).toBe("localhost:9000");
    expect(pathname).toBe("/b/k.txt");
  });

  it("refuses an expiry outside 1 to 604800 seconds", async () => {
    for (const expiresIn of [0, 604801, 1.5]) {
      await expect(presign({ bucket: "b", key: "k", expiresIn })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
  });

  it("gives no PUT URL to a call that cannot change s3, and still gives a GET URL", async () => {
    const readOnly: Capability = { effects: { writes: [] } };
    await expect(presign({ bucket: "b", key: "k", method: "PUT" }, readOnly)).rejects.toMatchObject({ code: "FORBIDDEN", reason: "effects-exceeded" });
    expect((await presign({ bucket: "b", key: "k" }, readOnly)).method).toBe("GET");
    const uploads: Capability = { effects: { writes: ["s3", "network"] } };
    expect((await presign({ bucket: "b", key: "k", method: "PUT" }, uploads)).method).toBe("PUT");
  });
});

describe("permitsUpload", () => {
  it("permits a PUT URL only with the writes of an upload", () => {
    expect(permitsUpload(undefined)).toBe(true);
    expect(permitsUpload({})).toBe(true);
    expect(permitsUpload({ effects: { writes: "any" } })).toBe(true);
    expect(permitsUpload({ effects: { reads: "any" } })).toBe(true);
    expect(permitsUpload({ effects: { writes: ["s3"] } })).toBe(false);
    expect(permitsUpload({ effects: { writes: ["s3", "network"], destructive: false } })).toBe(false);
  });
});
