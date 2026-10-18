/**
 * The s3 procedures under the root of a host (roadmap R33, tracker item O36). `s3.download` writes
 * its `destPath` in the root, and `s3.presign` has no path input. The other procedures reach no
 * file. Without a root, they run as before. A fake S3 client answers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createRegistry, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";

vi.mock("./s3-client.js", () => ({
  getS3Client: () => ({ send: async () => ({ Body: Readable.from([Buffer.from("object bytes")]), ContentLength: 12, ETag: '"e"' }) }),
}));

const { s3Module } = await import("./module.js");

let base: string;
let root: string;
let rooted: ProcedureRegistry;

async function call<T>(key: string, input: unknown, at: ProcedureRegistry = rooted): Promise<T> {
  return outputValue(await invokePath<T>(key.split("."), input, { registry: at }));
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "s3-host-root-"));
  root = join(base, "root");
  mkdirSync(root);
  rooted = createRegistry(s3Module);
  confineToRoot(rooted, root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("the s3 procedures under the root of a host", () => {
  it("confine s3.download and s3.presign, and leave the others as they are", () => {
    const kinds = Object.fromEntries(s3Module.procedures.map((procedure) => [procedure.path.join("."), rootDecisionOf(procedure).kind]));
    expect(kinds["s3.download"]).toBe("confined");
    expect(kinds["s3.presign"]).toBe("confined");
    const others = Object.entries(kinds).filter(([key]) => key !== "s3.download" && key !== "s3.presign");
    expect(new Set(others.map(([, kind]) => kind))).toEqual(new Set(["unchanged"]));
  });

  it("download to a file in the root, and refuse a file outside it", async () => {
    mkdirSync(join(root, "objects"));
    const result = await call<{ path?: string }>("s3.download", { bucket: "b", key: "k", destPath: "objects/a.bin" });
    expect(result.path).toBe(join(root, "objects", "a.bin"));
    expect(readFileSync(join(root, "objects", "a.bin"), "utf8")).toBe("object bytes");
    for (const destPath of [join(base, "a.bin"), "../a.bin"]) {
      await expect(call("s3.download", { bucket: "b", key: "k", destPath })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    }
    expect(existsSync(join(base, "a.bin"))).toBe(false);
    // Without destPath, the object stays in memory
    expect(await call<{ body: string }>("s3.download", { bucket: "b", key: "k", encoding: "utf8" })).toMatchObject({ body: "object bytes" });
  });

  it("download to each folder without a root", async () => {
    const plain = createRegistry(s3Module);
    await call("s3.download", { bucket: "b", key: "k", destPath: join(base, "a.bin") }, plain);
    expect(readFileSync(join(base, "a.bin"), "utf8")).toBe("object bytes");
  });
});
