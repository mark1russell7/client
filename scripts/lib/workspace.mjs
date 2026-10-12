// Helpers of the release scripts: the public packages of the workspace, their order, and the
// commands that the scripts start.

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

/** The root folder of the repository. */
export const root = resolve(import.meta.dirname, "..", "..");

/**
 * The general packages: separate repositories that the monorepo uses with github: specifiers
 * until they are on npm, and the npm range that replaces each specifier.
 */
export const GENERAL_PACKAGES = {
  "@mark1russell7/cue": "^1.0.0",
  "@mark1russell7/splay": "^0.1.0",
  "@mark1russell7/docker-sqlite": "^0.1.0",
};

/** Each folder of packages/ with a package.json, and its manifest. */
export function workspacePackages() {
  return readdirSync(join(root, "packages"))
    .filter((dir) => existsSync(join(root, "packages", dir, "package.json")))
    .map((dir) => ({ dir, path: join(root, "packages", dir), manifest: JSON.parse(readFileSync(join(root, "packages", dir, "package.json"), "utf8")) }));
}

/** The public packages (not `private`), with the dependencies first: a package comes after the packages it uses. */
export function publicPackages() {
  const packages = workspacePackages()
    .filter(({ manifest }) => manifest.private !== true)
    .map(({ dir, path, manifest }) => ({ dir, path, name: manifest.name, version: manifest.version, bin: manifest.bin ?? {}, manifest }));
  const byName = new Map(packages.map((p) => [p.name, p]));
  const ordered = [];
  const state = new Map();
  const visit = (pkg) => {
    if (state.get(pkg.name) === "done") return;
    if (state.get(pkg.name) === "visiting") throw new Error(`a dependency cycle through ${pkg.name}`);
    state.set(pkg.name, "visiting");
    const m = pkg.manifest;
    for (const dep of Object.keys({ ...m.dependencies, ...m.peerDependencies, ...m.optionalDependencies })) {
      const target = byName.get(dep);
      if (target) visit(target);
    }
    state.set(pkg.name, "done");
    ordered.push(pkg);
  };
  for (const pkg of [...packages].sort((a, b) => a.name.localeCompare(b.name))) visit(pkg);
  return ordered;
}

/**
 * Start a command and give its standard output. One command line with quoted arguments: pnpm
 * and npm are scripts on Windows, so they need a shell. `quiet` hides the standard error.
 */
export function run(cmd, args, cwd, quiet = false) {
  return execSync([cmd, ...args.map((a) => JSON.stringify(a))].join(" "), {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", quiet ? "pipe" : "inherit"],
  });
}

/**
 * The text of one file of a .tgz. The tar of Git for Windows reads "C:" in a path as a host
 * name, so the scripts read the archive themselves: gzip, then 512-byte ustar headers.
 */
export function readFromTarball(tgz, wanted) {
  const data = gunzipSync(readFileSync(tgz));
  for (let at = 0; at + 512 <= data.length; ) {
    const header = data.subarray(at, at + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start, length) => header.subarray(start, start + length).toString("utf8").replace(/\0.*$/s, "");
    const prefix = field(345, 155);
    const name = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100);
    const size = parseInt(field(124, 12).trim() || "0", 8);
    if (name === wanted) return data.subarray(at + 512, at + 512 + size).toString("utf8");
    at += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${wanted} is not in ${tgz}`);
}

/** The git specifiers (github:, git+, git:) in the dependencies of a manifest. */
export function gitDependencies(manifest) {
  const found = [];
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    for (const [dep, spec] of Object.entries(manifest[field] ?? {})) {
      if (/^(github:|git\+|git:)/.test(String(spec))) found.push(`${field}.${dep} = ${spec}`);
    }
  }
  return found;
}
