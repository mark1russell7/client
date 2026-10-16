/**
 * The S3 client of the package (roadmap R33): its configuration from the environment, and the
 * singleton. The `S3Client` of the AWS SDK is replaced, so the test makes no request and reads
 * no credentials of the machine.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The configuration that each `S3Client` got, and the clients that `destroy()` ended. */
const made: Array<Record<string, unknown>> = [];
const destroyed: unknown[] = [];

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(readonly config: Record<string, unknown>) {
      made.push(config);
    }
    destroy(): void {
      destroyed.push(this);
    }
  },
}));

const { createS3Client, getS3Client, getS3Config, resetS3Client } = await import("./s3-client.js");

const ENV = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_REGION", "S3_ENDPOINT"] as const;
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const name of ENV) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  made.length = 0;
  destroyed.length = 0;
});

afterEach(() => {
  resetS3Client();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("getS3Config", () => {
  it("reads the environment, with us-east-1 as the default region", () => {
    expect(getS3Config()).toEqual({ region: "us-east-1", endpoint: undefined, accessKeyId: undefined, secretAccessKey: undefined, sessionToken: undefined });
    process.env["AWS_REGION"] = "eu-west-1";
    process.env["S3_ENDPOINT"] = "http://127.0.0.1:9000";
    process.env["AWS_ACCESS_KEY_ID"] = "id";
    process.env["AWS_SECRET_ACCESS_KEY"] = "secret";
    process.env["AWS_SESSION_TOKEN"] = "token";
    expect(getS3Config()).toEqual({ region: "eu-west-1", endpoint: "http://127.0.0.1:9000", accessKeyId: "id", secretAccessKey: "secret", sessionToken: "token" });
  });
});

describe("createS3Client", () => {
  it("gives no credentials without the two keys, so the SDK uses its default chain", () => {
    process.env["AWS_ACCESS_KEY_ID"] = "id";
    createS3Client();
    expect(made[0]).toEqual({ region: "us-east-1" });
  });

  it("gives the static credentials with the two keys, and the session token when it is set", () => {
    process.env["AWS_ACCESS_KEY_ID"] = "id";
    process.env["AWS_SECRET_ACCESS_KEY"] = "secret";
    createS3Client();
    expect(made[0]).toEqual({ region: "us-east-1", credentials: { accessKeyId: "id", secretAccessKey: "secret" } });
    process.env["AWS_SESSION_TOKEN"] = "token";
    createS3Client();
    expect(made[1]?.["credentials"]).toEqual({ accessKeyId: "id", secretAccessKey: "secret", sessionToken: "token" });
  });

  it("uses the path style with a custom endpoint (MinIO, LocalStack)", () => {
    process.env["S3_ENDPOINT"] = "http://127.0.0.1:9000";
    createS3Client();
    expect(made[0]).toEqual({ region: "us-east-1", endpoint: "http://127.0.0.1:9000", forcePathStyle: true });
  });
});

describe("getS3Client and resetS3Client", () => {
  it("make one client, and a new one after a reset that ends the old one", () => {
    const first = getS3Client();
    expect(getS3Client()).toBe(first);
    expect(made).toHaveLength(1);
    resetS3Client();
    expect(destroyed).toEqual([first]);
    const second = getS3Client();
    expect(second).not.toBe(first);
    expect(made).toHaveLength(2);
  });

  it("reset does nothing without a client", () => {
    resetS3Client();
    resetS3Client();
    expect(destroyed).toEqual([]);
  });
});
