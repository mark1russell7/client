/**
 * `exif.read` under the root of a host (roadmap R33, tracker item O36): the photo must be in the
 * root, and a relative path starts at the root. Without a root, nothing changes.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { exifModule } from "./module.js";

let base: string;
let root: string;
let rooted: ProcedureRegistry;

async function call(input: unknown, at: ProcedureRegistry = rooted): Promise<unknown> {
  return outputValue(await invokePath(["exif", "read"], input, { registry: at }));
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "exif-host-root-"));
  root = join(base, "root");
  mkdirSync(root);
  // A JPEG without EXIF: the start and the end markers
  for (const folder of [root, base]) writeFileSync(join(folder, "photo.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  rooted = createRegistry(exifModule);
  confineToRoot(rooted, root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("exif.read under the root of a host", () => {
  it("is confined, with the path of the photo as its rule", () => {
    expect(rootDecisionOf(exifModule.procedures[0]!).kind).toBe("confined");
    expect(exifModule.procedures[0]!.metadata.fsRoot).toEqual({ paths: ["path"] });
  });

  it("reads a photo in the root, and refuses a photo outside it", async () => {
    expect(await call({ path: "photo.jpg" })).toEqual({});
    expect(await call({ path: join(root, "photo.jpg") })).toEqual({});
    for (const path of [join(base, "photo.jpg"), "../photo.jpg"]) {
      await expect(call({ path })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    }
  });

  it("reads each photo without a root", async () => {
    expect(await call({ path: join(base, "photo.jpg") }, createRegistry(exifModule))).toEqual({});
  });
});
