/**
 * The command manifest of mark (roadmap 1.3): the build writes it, it matches the registry, and
 * a new build of a package makes it stale. A stale manifest makes this test fail in CI.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROCEDURE_REGISTRY } from "@mark1russell7/client";
import { discoverFromEcosystem, loadEcosystemProcedures } from "./ecosystem.js";
import { commandsOf, computeFingerprint, readFreshManifest, type Manifest } from "./manifest.js";

const markDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("the manifest of mark", () => {
  beforeAll(async () => {
    await loadEcosystemProcedures(false, false);
  }, 120000);

  it("mark depends on each package that has procedures, so the build of mark comes after them", () => {
    const pkg = JSON.parse(readFileSync(join(markDir, "package.json"), "utf8")) as Record<string, Record<string, string>>;
    const dependencies = new Set([...Object.keys(pkg["dependencies"] ?? {}), ...Object.keys(pkg["devDependencies"] ?? {})]);
    const missing = discoverFromEcosystem()
      .map((found) => found.name)
      .filter((name) => !dependencies.has(name));
    expect(missing, `Add these packages to the devDependencies of mark (workspace:*): ${missing.join(", ")}`).toEqual([]);
  });

  it("is current after the build, and has the commands of the registry", async () => {
    const manifest = readFreshManifest();
    expect(manifest, "dist/manifest.json is missing or stale: build mark (pnpm --filter @mark1russell7/cli build)").not.toBeNull();
    const expected = JSON.parse(JSON.stringify(await commandsOf(PROCEDURE_REGISTRY.getAll())));
    expect(manifest!.commands).toEqual(expected);
  }, 120000);

  it("gives the fields of the input with their types, and the JSON Schema", () => {
    const manifest = readFreshManifest();
    const status = manifest?.commands.find((command) => command.path.join(".") === "git.commit");
    expect(status?.metadata.shorts).toMatchObject({ message: "m" });
    expect(status?.fields.find((field) => field.name === "message")).toMatchObject({ fieldType: { kind: "string" } });
    expect(status?.inputSchema).toMatchObject({ type: "object" });
  });
});

describe("the fingerprint", () => {
  /** A workspace with one package that has procedures and a build */
  function workspace(): { root: string; info: string } {
    const root = mkdtempSync(join(tmpdir(), "mark-manifest-"));
    dirs.push(root);
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    const pkg = join(root, "packages", "demo");
    mkdirSync(join(pkg, "dist"), { recursive: true });
    writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "demo", client: { procedures: "./dist/register.js" } }));
    writeFileSync(join(pkg, "dist", "register.js"), "");
    const info = join(pkg, "dist", ".tsbuildinfo");
    writeFileSync(info, "{}");
    return { root, info };
  }

  it("changes when a package is built again", () => {
    const { root, info } = workspace();
    const before = computeFingerprint(root, markDir);
    const later = new Date(Date.now() + 60_000);
    utimesSync(info, later, later);
    expect(computeFingerprint(root, markDir)).not.toBe(before);
  });

  it("changes when a package with procedures is added", () => {
    const { root } = workspace();
    const before = computeFingerprint(root, markDir);
    const other = join(root, "packages", "other");
    mkdirSync(other);
    writeFileSync(join(other, "package.json"), JSON.stringify({ name: "other", client: { procedures: "./dist/register.js" } }));
    expect(computeFingerprint(root, markDir)).not.toBe(before);
  });

  it("makes a manifest with another fingerprint stale", () => {
    const root = mkdtempSync(join(tmpdir(), "mark-manifest-"));
    dirs.push(root);
    const file = join(root, "manifest.json");
    const manifest: Manifest = { version: 1, fingerprint: "old", generatedAt: "", commands: [] };
    writeFileSync(file, JSON.stringify(manifest));
    expect(readFreshManifest(file)).toBeNull();
    writeFileSync(file, JSON.stringify({ ...manifest, fingerprint: computeFingerprint() }));
    expect(readFreshManifest(file)).not.toBeNull();
  });
});
