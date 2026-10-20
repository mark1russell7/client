// Each package that a published package imports is declared (roadmap CLI-63).
//
// pnpm installs a package strictly: the code of a package finds only the packages of its own
// dependencies, peerDependencies and optionalDependencies. npm hoists all packages to one
// node_modules, and the tests of the monorepo see the devDependencies, so an undeclared import
// works there and fails only for a strict consumer, at the start, with ERR_MODULE_NOT_FOUND.
// Example: @procedures/mcp-server 0.17.1 imports zod, and declares it only in devDependencies.
//
// For each public package, this script bundles its entries with esbuild, as the browser check
// (CLI-39) does. The entries are the files of its exports map (all conditions except "types"),
// its bins, and its main when it has no exports map. esbuild follows the relative files, so the
// check reads only the code that an entry reaches: a file that only the tests import does not
// count. The packages stay external, and the metafile gives each import of each file: the static
// imports, `export from`, the dynamic imports with a literal name, `require` and `require.resolve`.
// esbuild parses the code, so a comment or a text that looks like an import counts for nothing.
// The JavaScript of tsc has no `import type`, so a type-only import counts for nothing too. (In a
// TypeScript entry, the parser erases `import type`, but the metafile keeps `import { type X }`.)
//
// The check reduces each import to its package name (`@scope/name/sub` → `@scope/name`, and
// `name/sub` → `name`). It drops the Node built-ins, with or without the prefix `node:`, the
// subpath imports (`#name`), the URLs, and the imports of the package itself. Each other name
// must be in dependencies, peerDependencies or optionalDependencies. devDependencies do not count:
// npm does not install them for a consumer.
//
// Start it after `pnpm build`: node scripts/check-declared-imports.mjs. Exit code 1 on a failure.
// The tests of the check: node --test scripts/check-declared-imports.test.mjs.

import { existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { isBuiltin } from "./check-browser-entries.mjs";
import { publicPackages } from "./lib/workspace.mjs";

/** A valid npm package name, with an optional scope. Old packages can have capital letters. */
const PACKAGE_NAME = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/i;

/** The file extensions of the code that esbuild can read. A declaration file (`.d.ts`) is not code. */
const CODE = /\.(?:[cm]?[jt]s|[jt]sx)$/;

/**
 * The package name of an import, or undefined when the import names no package: a relative or
 * absolute path, a subpath import (`#name`), a URL, a Node built-in, or a text that is not a
 * valid package name.
 */
export function packageNameOf(specifier) {
  if (typeof specifier !== "string" || specifier === "") return undefined;
  if (/^[./\\#]/.test(specifier) || /^[a-z][a-z0-9+.-]*:/i.test(specifier) || isBuiltin(specifier)) return undefined;
  const parts = specifier.split("/");
  const name = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  return PACKAGE_NAME.test(name) && !isBuiltin(name) ? name : undefined;
}

/** The files of a target of the exports map: each condition except "types", and each file of a pattern. */
function targetFiles(target, pkgPath, files = []) {
  if (typeof target === "string") {
    if (!target.includes("*")) {
      if (CODE.test(target) && !/\.d\.[cm]?ts$/.test(target)) files.push(target);
      return files;
    }
    const [prefix, suffix] = target.split("*", 2);
    const base = prefix.slice(0, prefix.lastIndexOf("/") + 1);
    for (const file of filesUnder(resolve(pkgPath, base))) {
      const path = `${base}${relative(resolve(pkgPath, base), file).split("\\").join("/")}`;
      if (path.startsWith(prefix) && path.endsWith(suffix)) targetFiles(path, pkgPath, files);
    }
  } else if (Array.isArray(target)) {
    for (const item of target) targetFiles(item, pkgPath, files);
  } else if (target !== null && typeof target === "object") {
    for (const [condition, item] of Object.entries(target)) if (condition !== "types") targetFiles(item, pkgPath, files);
  }
  return files;
}

/** Each file under a folder, or none when the folder does not exist. */
function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

/** The entry files of a package, relative to its folder: the exports map, the bins, or the main. */
export function entryFiles(manifest, pkgPath) {
  const files = [];
  if (manifest.exports !== undefined) targetFiles(manifest.exports, pkgPath, files);
  else if (typeof manifest.main === "string") targetFiles(manifest.main, pkgPath, files);
  const bin = typeof manifest.bin === "string" ? [manifest.bin] : Object.values(manifest.bin ?? {});
  for (const file of bin) targetFiles(file, pkgPath, files);
  return [...new Set(files.map((file) => (file.startsWith("./") ? file : `./${file}`)))];
}

/** Each import of a package that the entries reach: the file (relative to the package) and the import. */
async function externalImports(entries, pkgPath) {
  const result = await build({
    entryPoints: entries.map((file) => resolve(pkgPath, file)),
    absWorkingDir: pkgPath,
    bundle: true,
    write: false,
    metafile: true,
    platform: "node",
    format: "esm",
    packages: "external",
    logLevel: "silent",
    outdir: join(tmpdir(), "check-declared-imports"),
  });
  const found = [];
  for (const [file, input] of Object.entries(result.metafile.inputs)) {
    for (const imported of input.imports) {
      if (imported.external) found.push({ file: file.split("\\").join("/"), specifier: imported.original ?? imported.path });
    }
  }
  return found;
}

/**
 * The problems of the imports of the packages. Each package is `{ name, path, manifest }`. Each
 * problem is one text: `<package>: <file> imports '<name>', which is not declared`, with the file
 * relative to the package. The result also counts the entries that the check read.
 */
export async function undeclaredImportProblems(packages) {
  const problems = [];
  let entries = 0;
  for (const pkg of packages) {
    const files = entryFiles(pkg.manifest, pkg.path);
    const missing = files.filter((file) => !existsSync(resolve(pkg.path, file)));
    for (const file of missing) problems.push(`${pkg.name}: the entry ${file} does not exist (start pnpm build first)`);
    const present = files.filter((file) => !missing.includes(file));
    if (present.length === 0) continue;
    entries += present.length;
    const { dependencies, peerDependencies, optionalDependencies } = pkg.manifest;
    const declared = new Set([pkg.manifest.name, ...Object.keys({ ...dependencies, ...peerDependencies, ...optionalDependencies })]);
    let imports;
    try {
      imports = await externalImports(present, pkg.path);
    } catch (error) {
      const messages = (error.errors ?? [error]).map((e) => e.text ?? e.message ?? String(e)).join("; ");
      problems.push(`${pkg.name}: esbuild cannot read its entries: ${messages}`);
      continue;
    }
    const seen = new Set();
    for (const { file, specifier } of imports) {
      const name = packageNameOf(specifier);
      if (name === undefined || declared.has(name) || seen.has(`${file}\0${name}`)) continue;
      seen.add(`${file}\0${name}`);
      problems.push(`${pkg.name}: ${file} imports '${name}', which is not declared`);
    }
  }
  return { problems, entries };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const packages = publicPackages().map(({ name, path, manifest }) => ({ name, path, manifest }));
  const { problems, entries } = await undeclaredImportProblems(packages);
  if (problems.length > 0) {
    console.error(`${problems.length} problems:\n  ${problems.join("\n  ")}`);
    console.error("Add each package to dependencies, or to peerDependencies when its values cross the API of the package.");
    process.exit(1);
  }
  console.log(`The ${entries} entries of ${packages.length} public packages import only declared packages.`);
}
