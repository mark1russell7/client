// The browser entries reach no Node built-in (roadmap CLI-39).
//
// A package names its browser entries in the field `client.browser` of its package.json: a list
// of keys of its exports map, for example [".", "./module"]. The list is data, so the check does
// not guess from a name. For each entry, this script bundles the built file with esbuild for the
// browser, as Vite does. esbuild follows each import: the relative files, the other packages
// (through their exports maps, with the condition "browser"), the dynamic imports and `require`.
// The check fails when an import names a Node built-in, with the prefix `node:` (`node:fs`) or
// without it (`http`). The list of the built-ins is `builtinModules` of `node:module`. A browser
// bundler cannot bundle a built-in: Vite externalizes it with a warning, and the page fails.
//
// The root of @procedures/client is a browser entry since CLI-6 step 2. HttpServerTransport and
// WebSocketServerTransport, which import `http` and `ws`, are only in ./node.
//
// Start it after `pnpm build`: node scripts/check-browser-entries.mjs. Exit code 1 on a failure.
// The tests of the check: node --test scripts/check-browser-entries.test.mjs.

import { existsSync } from "node:fs";
import { builtinModules } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { root, workspacePackages } from "./lib/workspace.mjs";

const BUILTINS = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));

/** True when a module name is a Node built-in: `node:` and any name, or a name of `builtinModules`. */
export function isBuiltin(specifier) {
  return specifier.startsWith("node:") || BUILTINS.has(specifier);
}

/** The file of an exports entry for a browser bundler, or undefined for a pattern or a non-JS entry. */
function fileOf(target) {
  const file = typeof target === "string" ? target : target?.browser ?? target?.import ?? target?.default;
  return typeof file === "string" && /\.[cm]?js$/.test(file) && !file.includes("*") ? file : undefined;
}

/** The keys of `client.browser`, or a problem when the field is not a list of texts. */
function declaredEntries(manifest) {
  const keys = manifest.client?.browser;
  if (keys === undefined) return { keys: [] };
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== "string")) return { problem: "client.browser is not a list of exports keys" };
  return { keys };
}

/** The shortest chain of files of the metafile from the entry to the file that imports the built-in. */
function chainTo(inputs, entry, importer) {
  const parent = new Map([[entry, undefined]]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift();
    if (file === importer) break;
    for (const imported of inputs[file]?.imports ?? []) {
      if (imported.external || parent.has(imported.path)) continue;
      parent.set(imported.path, file);
      queue.push(imported.path);
    }
  }
  const chain = [];
  for (let file = importer; file !== undefined; file = parent.get(file)) chain.unshift(file);
  return chain;
}

/**
 * This function bundles one file for the browser, and gives each Node built-in on its way: the
 * module name and the shortest chain of files from the entry to a file that imports it.
 */
async function builtinsReachedFrom(file, cwd) {
  const reached = [];
  const plugin = {
    name: "node-builtins",
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === "entry-point" || !isBuiltin(args.path)) return undefined;
        reached.push({ specifier: args.path, importer: args.importer });
        return { path: args.path, external: true };
      });
    },
  };
  const result = await build({
    entryPoints: [file],
    absWorkingDir: cwd,
    bundle: true,
    write: false,
    metafile: true,
    platform: "browser",
    format: "esm",
    logLevel: "silent",
    outdir: join(tmpdir(), "check-browser-entries"),
    plugins: [plugin],
  });
  const key = (path) => relative(cwd, path).split("\\").join("/");
  const shortest = new Map();
  for (const { specifier, importer } of reached) {
    const chain = chainTo(result.metafile.inputs, key(file), key(importer));
    if (!shortest.has(specifier) || chain.length < shortest.get(specifier).length) shortest.set(specifier, chain);
  }
  return [...shortest].map(([specifier, chain]) => ({ specifier, chain }));
}

/**
 * The problems of the browser entries of the packages. Each package is `{ name, path, manifest }`.
 * `cwd` is the folder that the chains of files are relative to. The result also counts the entries.
 */
export async function browserEntryProblems(packages, cwd = root) {
  const problems = [];
  let entries = 0;
  for (const pkg of packages) {
    const { keys, problem } = declaredEntries(pkg.manifest);
    if (problem) {
      problems.push(`${pkg.name}: ${problem}`);
      continue;
    }
    const exportsMap = pkg.manifest.exports ?? {};
    const map = typeof exportsMap === "string" ? { ".": exportsMap } : exportsMap;
    for (const key of keys) {
      if (!(key in map)) {
        problems.push(`${pkg.name}: client.browser names "${key}", but the exports map has no "${key}"`);
        continue;
      }
      const target = fileOf(map[key]);
      if (!target) {
        problems.push(`${pkg.name}: the exports entry "${key}" has no JavaScript file to bundle`);
        continue;
      }
      const file = resolve(pkg.path, target);
      if (!existsSync(file)) {
        problems.push(`${pkg.name}: "${key}" is ${target}, and that file does not exist (start pnpm build first)`);
        continue;
      }
      entries++;
      try {
        for (const { specifier, chain } of await builtinsReachedFrom(file, cwd)) {
          problems.push(`${pkg.name} "${key}" reaches the Node built-in "${specifier}":\n      ${chain.join("\n    → ")}\n      imports "${specifier}"`);
        }
      } catch (error) {
        const messages = (error.errors ?? [error]).map((e) => e.text ?? e.message ?? String(e)).join("; ");
        problems.push(`${pkg.name} "${key}": esbuild cannot bundle it for a browser: ${messages}`);
      }
    }
  }
  return { problems, entries };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const packages = workspacePackages().map(({ path, manifest }) => ({ name: manifest.name, path, manifest }));
  const { problems, entries } = await browserEntryProblems(packages);
  if (problems.length > 0) {
    console.error(`${problems.length} problems:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  const declaring = packages.filter((pkg) => (pkg.manifest.client?.browser ?? []).length > 0).length;
  console.log(`The ${entries} browser entries of ${declaring} packages reach no Node built-in.`);
}
