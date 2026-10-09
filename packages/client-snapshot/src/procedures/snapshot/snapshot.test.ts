/**
 * snapshot.create, list and restore against a fake S3 (test/fake-s3.ts).
 *
 * - DATA-16: list reads all pages and returns the newest snapshots.
 * - DATA-19: a large archive goes up in parts read from the file, and the checksum is right.
 * - restore with overwrite: true replaces each restored folder (no stale files).
 * - multipart: the error of a failed part stays the error, also when the abort fails.
 */

import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshotCreate } from "./create.js";
import { snapshotList } from "./list.js";
import { snapshotRestore } from "./restore.js";
import { fakeS3 } from "../../../test/fake-s3.js";
import type { SnapshotMetadata } from "../../types.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function write(file: string, content: string | Buffer): void {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, content);
}

/** An ecosystem folder with one repository "proj". */
function project(): { root: string; repo: string } {
  const root = tempDir("snapshot-eco-");
  const repo = join(root, "proj");
  write(join(repo, "src", "a.ts"), "export const a = 1;\n");
  write(join(repo, "node_modules", "x", "index.js"), "module.exports = 1;\n");
  write(join(repo, "dist", "a.js"), "compiled\n");
  write(join(repo, "app.log"), "log\n");
  return { root, repo };
}

function metadata(id: string, name: string, createdAt: string): SnapshotMetadata {
  return {
    id,
    name,
    preset: "light",
    createdAt,
    environment: { os: "linux", nodeVersion: "v24", pnpmVersion: "12", username: "u", hostname: "h" },
    repositories: [],
    checksum: "",
    archiveSize: 1,
  };
}

describe("snapshot.create and snapshot.restore", () => {
  it("round-trips a repository and leaves out the light-preset exclusions", async () => {
    const s3 = fakeS3();
    const { repo } = project();

    const created = await snapshotCreate({ name: "dev", preset: "light", bucket: "b", paths: [repo] }, s3.ctx);
    const target = tempDir("snapshot-target-");
    const restored = await snapshotRestore({ id: created.id, bucket: "b", targetPath: target, overwrite: false }, s3.ctx);

    expect(restored.success).toBe(true);
    expect(readFileSync(join(target, "proj", "src", "a.ts"), "utf8")).toBe("export const a = 1;\n");
    expect(existsSync(join(target, "proj", "node_modules"))).toBe(false);
    expect(existsSync(join(target, "proj", "dist"))).toBe(false);
    expect(existsSync(join(target, "proj", "app.log"))).toBe(false);
  });

  it("replaces the restored folder with overwrite: true, so no stale file stays", async () => {
    const s3 = fakeS3();
    const { repo } = project();
    const created = await snapshotCreate({ name: "dev", preset: "light", bucket: "b", paths: [repo] }, s3.ctx);

    const target = tempDir("snapshot-target-");
    write(join(target, "proj", "stale.txt"), "old\n");
    write(join(target, "other", "keep.txt"), "keep\n");

    await snapshotRestore({ id: created.id, bucket: "b", targetPath: target, overwrite: true }, s3.ctx);

    expect(existsSync(join(target, "proj", "stale.txt"))).toBe(false);
    expect(existsSync(join(target, "proj", "src", "a.ts"))).toBe(true);
    // A folder that the snapshot does not hold stays
    expect(readFileSync(join(target, "other", "keep.txt"), "utf8")).toBe("keep\n");
  });

  it("refuses to overwrite an existing folder with overwrite: false", async () => {
    const s3 = fakeS3();
    const { repo } = project();
    const created = await snapshotCreate({ name: "dev", preset: "light", bucket: "b", paths: [repo] }, s3.ctx);
    const target = tempDir("snapshot-target-");
    write(join(target, "proj", "mine.txt"), "mine\n");

    await expect(
      snapshotRestore({ id: created.id, bucket: "b", targetPath: target, overwrite: false }, s3.ctx),
    ).rejects.toThrow("already exists");
    expect(readFileSync(join(target, "proj", "mine.txt"), "utf8")).toBe("mine\n");
  });

  it("uploads a large archive in parts, with the right checksum (DATA-19)", async () => {
    const s3 = fakeS3();
    const { repo } = project();
    // Random bytes do not compress: the archive is larger than one 5 MiB part
    write(join(repo, "src", "blob.bin"), randomBytes(6 * 1024 * 1024));

    const created = await snapshotCreate({ name: "big", preset: "light", bucket: "b", paths: [repo] }, s3.ctx);

    expect(s3.calls.filter((call) => call === "s3.multipart.upload")).toHaveLength(2);
    const target = tempDir("snapshot-target-");
    // restore checks the checksum before it extracts
    await snapshotRestore({ id: created.id, bucket: "b", targetPath: target, overwrite: false }, s3.ctx);
    expect(readFileSync(join(target, "proj", "src", "blob.bin")).length).toBe(6 * 1024 * 1024);
   }, 30_000);

  it("keeps the error of a failed part when the abort also fails", async () => {
    const s3 = fakeS3();
    const { repo } = project();
    write(join(repo, "src", "blob.bin"), randomBytes(6 * 1024 * 1024));
    s3.override("s3.multipart.upload", () => {
      throw new Error("part failed");
    });
    s3.override("s3.multipart.abort", () => {
      throw new Error("abort failed");
    });

    await expect(snapshotCreate({ name: "big", preset: "light", bucket: "b", paths: [repo] }, s3.ctx)).rejects.toThrow(
      /part failed.*abort failed/,
    );
   }, 30_000);
});

describe("snapshot.list (deep dive DATA-16)", () => {
  it("returns the newest snapshots, from all pages", async () => {
    // S3 lists by key: the names put the oldest snapshot first
    const s3 = fakeS3(3);
    const entries = [
      ["a-old", "2026-01-01T00:00:00Z"],
      ["b-older", "2025-12-01T00:00:00Z"],
      ["c-new", "2026-03-01T00:00:00Z"],
      ["d-newest", "2026-04-01T00:00:00Z"],
    ] as const;
    for (const [name, createdAt] of entries) {
      const id = `${name}-1`;
      s3.objects.set(`snapshots/${name}/${id}.tar.gz`, { body: Buffer.from("x"), lastModified: createdAt });
      s3.objects.set(`snapshots/${name}/${id}.metadata.json`, {
        body: Buffer.from(JSON.stringify(metadata(id, name, createdAt))),
        lastModified: createdAt,
      });
    }

    const result = await snapshotList({ bucket: "b", maxResults: 2 }, s3.ctx);

    expect(result.snapshots.map((snapshot) => snapshot.name)).toEqual(["d-newest", "c-new"]);
    expect(result.count).toBe(2);
  });
});
