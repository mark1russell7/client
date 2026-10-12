/**
 * The command manifest of mark (architecture review 3.6, roadmap 1.3).
 *
 * Before, each run of mark imported the procedure modules of every package (about 4 s), also to
 * show the help or to send a command to the CLI server. The manifest holds what the command line
 * needs without the procedures: the path, the CLI metadata, the fields of the input (with the
 * types that the flag parser converts to) and the JSON Schema of the input. mark reads it first.
 * It imports the procedures only to run a command in this process.
 *
 * The build of mark writes `dist/manifest.json`. A run checks the fingerprint of the manifest:
 * the packages that declare `client.procedures` and the build information of each one, of the
 * core, and of mark. When a package was built again, or added, or removed, the fingerprint
 * changes: mark then loads the procedures as before and writes the manifest again.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { jsonSchemaOf, type AnyProcedure } from "@procedures/client";
import { discoverFromEcosystem, findWorkspaceRoot } from "./ecosystem.js";
import { extractSchemaFields, resultFieldsOfSchema, type CLIMeta, type SchemaFieldInfo } from "./parse.js";

/**
 * The format of the manifest. A change of the format makes old manifests stale.
 * Version 2 adds `resultFields`.
 */
export const MANIFEST_VERSION = 2;

/** One command of the manifest */
export interface ManifestCommand {
  path: string[];
  /** The CLI metadata of the procedure (description, args, shorts, output, interactive) */
  metadata: CLIMeta;
  /** The fields of the input, as the flag parser and the help read them */
  fields: SchemaFieldInfo[];
  /** The JSON Schema of the input */
  inputSchema: unknown;
  /** The fields of the result, for the help (none when the result is not an object) */
  resultFields: SchemaFieldInfo[];
}

export interface Manifest {
  version: number;
  /** The state of the builds that the manifest describes (see `computeFingerprint`) */
  fingerprint: string;
  generatedAt: string;
  commands: ManifestCommand[];
}

/** The folder of the mark package: the nearest folder above this module with a package.json */
function markRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (!fs.existsSync(path.join(dir, "package.json"))) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}

/** The path of the manifest: in the dist folder of mark (also when this module runs from src) */
export function manifestPath(): string {
  return path.join(markRoot(), "dist", "manifest.json");
}

/** The size and the modification time of a file, or "-" when it does not exist */
function stamp(file: string): string {
  try {
    const stat = fs.statSync(file);
    return `${stat.size}:${Math.round(stat.mtimeMs)}`;
  } catch {
    return "-";
  }
}

/**
 * The fingerprint of the builds that the manifest depends on. `tsc -b` writes
 * `dist/.tsbuildinfo` each time it builds a package, so a new build of any package changes it.
 * For a package without that file, the procedures file counts. `tsc --noEmit` (the typecheck
 * script) also writes that file when the sources changed after the last build: the manifest is
 * then stale, and the next run of mark loads the procedures and writes it again.
 */
export function computeFingerprint(root: string | null = findWorkspaceRoot(), markDir: string = markRoot()): string {
  const parts: string[] = [`v${MANIFEST_VERSION}`];
  if (root) {
    parts.push(`client:${stamp(path.join(root, "packages", "client", "dist", ".tsbuildinfo"))}`);
  }
  // The field extraction is code of mark: a new build of mark can read the schemas differently
  parts.push(`mark:${stamp(path.join(markDir, "dist", ".tsbuildinfo"))}`);
  for (const pkg of root ? discoverFromEcosystem(root) : []) {
    const info = stamp(path.join(pkg.path, "dist", ".tsbuildinfo"));
    const procedures = info === "-" ? stamp(path.join(pkg.path, pkg.proceduresPath)) : info;
    parts.push(`${pkg.name}:${pkg.proceduresPath}:${procedures}`);
  }
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

/** The CLI metadata of a procedure: only the fields that mark reads, so the manifest is plain JSON */
function cliMetadata(procedure: AnyProcedure): CLIMeta {
  const meta = (procedure.metadata ?? {}) as Record<string, unknown>;
  const result: CLIMeta = {};
  if (typeof meta["description"] === "string") result.description = meta["description"];
  if (Array.isArray(meta["args"])) result.args = (meta["args"] as unknown[]).filter((arg): arg is string => typeof arg === "string");
  if (meta["shorts"] && typeof meta["shorts"] === "object") result.shorts = { ...(meta["shorts"] as Record<string, string>) };
  if (typeof meta["output"] === "string") result.output = meta["output"] as NonNullable<CLIMeta["output"]>;
  if (typeof meta["interactive"] === "boolean") result.interactive = meta["interactive"];
  return result;
}

/** The commands of the manifest, from the procedures of the registry */
export async function commandsOf(procedures: readonly AnyProcedure[]): Promise<ManifestCommand[]> {
  return procedures.map((procedure) => {
    // One JSON Schema for each command: the fields come from it too (roadmap 2.1)
    const inputSchema = jsonSchemaOf(procedure.input) ?? {};
    return {
      path: [...procedure.path],
      metadata: cliMetadata(procedure),
      fields: extractSchemaFields(inputSchema),
      inputSchema,
      resultFields: resultFieldsOfSchema(procedure.output),
    };
  });
}

/** JSON of a manifest: a bigint (a default or a literal) becomes its text */
function toJson(manifest: Manifest): string {
  return JSON.stringify(manifest, (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value), 1);
}

/** Write the manifest of these procedures for the current fingerprint (a temporary file, then a rename) */
export async function writeManifest(procedures: readonly AnyProcedure[], file: string = manifestPath()): Promise<Manifest> {
  const manifest: Manifest = {
    version: MANIFEST_VERSION,
    fingerprint: computeFingerprint(),
    generatedAt: new Date().toISOString(),
    commands: await commandsOf(procedures),
  };
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, toJson(manifest));
  try {
    fs.renameSync(temporary, file);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
  return manifest;
}

/** The manifest when it exists and matches the current builds, or null */
export function readFreshManifest(file: string = manifestPath()): Manifest | null {
  let manifest: Manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
  } catch {
    return null;
  }
  if (manifest.version !== MANIFEST_VERSION || !Array.isArray(manifest.commands)) {
    return null;
  }
  return manifest.fingerprint === computeFingerprint() ? manifest : null;
}
