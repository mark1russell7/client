// The report of the public API of a package, from its built `.d.ts` files (roadmap R30, CLI-86).
//
// The report lists the names that each entry of the `exports` field gives, and the declaration of
// each name. It follows `export *`, `export { a as b } from`, `export * as ns` and the imports that
// a module exports again. It also lists the ambient declarations (`declare module "x"`, `declare
// global`, `export as namespace`) of each file that an entry reaches. The report has no comments
// and no private members, so a change of a comment or of a private field does not change it. The
// text is the same on Windows and on Linux: the line ends are LF, the paths use `/`, and the sort
// does not use the locale.
//
// TypeScript 7 has no stable compiler API, so this module reads the declaration files as text. The
// declaration emit of `tsc` is regular, and an unknown form of statement throws. The module is plain
// JavaScript with no dependencies, so each repository can use it without a build or a test runner.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/** The path of the report in a package folder. */
export const REPORT_FILE = "test/api/public-api.txt";

/** The conditions of the `exports` field that a TypeScript consumer can use, in no order. */
const CONDITIONS = new Set(["types", "import", "node", "default", "require"]);

/** The order of the code units: the same on each machine. */
export const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** A path relative to `root`, with `/`. */
const relativePath = (root, file) => relative(root, file).split(sep).join("/");

/**
 * This function splits the text of a declaration file into its top-level statements, without the
 * comments, the blank lines and the spaces at the ends of the lines.
 */
export function statementsOf(source) {
  // The declarations of a bin file keep its `#!` line
  const text = source.replace(/\r\n?/g, "\n").replace(/^#![^\n]*\n?/, "");
  const statements = [];
  let current = "";
  let depth = 0;
  // The depth of the type arguments at the top level: `class A<T = {}> {` has a brace in them
  let angle = 0;
  // True when the body of a class, an interface, an enum or a namespace is open
  let body = false;
  // The template literals and their `${ }` parts, from the outside in
  const modes = [];
  const blockHeader = /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+class|class|interface|const\s+enum|enum|namespace|module|global)\b/;

  const finish = () => {
    const lines = current
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.trim() !== "");
    if (lines.length > 0) statements.push(lines.join("\n"));
    current = "";
    angle = 0;
    body = false;
  };

  let index = 0;
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    const mode = modes.at(-1);
    if (mode?.kind === "template") {
      if (char === "\\") {
        current += char + (next ?? "");
        index += 2;
      } else if (char === "`") {
        modes.pop();
        current += char;
        index++;
      } else if (char === "$" && next === "{") {
        modes.push({ kind: "part", depth });
        current += "${";
        index += 2;
      } else {
        current += char;
        index++;
      }
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index++;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end < 0 ? text.length : end + 2;
      current += " ";
      continue;
    }
    if (char === '"' || char === "'") {
      let end = index + 1;
      while (end < text.length && text[end] !== char) end += text[end] === "\\" ? 2 : 1;
      current += text.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    if (char === "`") {
      modes.push({ kind: "template" });
      current += char;
      index++;
      continue;
    }
    if (modes.length === 0 && depth === 0) {
      // The `>` of an arrow `=>` closes nothing
      if (char === "<") angle++;
      else if (char === ">" && text[index - 1] !== "=") angle = Math.max(0, angle - 1);
      else if (char === "{" && angle === 0 && !body && blockHeader.test(current.trim())) body = true;
    }
    if (char === "{" || char === "(" || char === "[") depth++;
    if (char === "}" || char === ")" || char === "]") {
      if (char === "}" && mode?.kind === "part" && depth === mode.depth) {
        modes.pop();
        current += char;
        index++;
        continue;
      }
      depth--;
    }
    current += char;
    index++;
    if (modes.length > 0 || depth !== 0) continue;
    if (char === ";" || (char === "}" && body)) finish();
  }
  finish();
  return statements;
}

/** This function splits `text` at each comma outside brackets, type arguments and strings. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"' || char === "'" || char === "`") {
      let end = index + 1;
      while (end < text.length && text[end] !== char) end += text[end] === "\\" ? 2 : 1;
      index = end;
    } else if (char === "(" || char === "[" || char === "{" || char === "<") depth++;
    else if (char === ")" || char === "]" || char === "}" || (char === ">" && text[index - 1] !== "=")) depth--;
    else if (char === "," && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** The names of an export or import list: `a, type b, c as d`. */
function specifiersOf(list, typeOnly) {
  return list
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => {
      const match = /^(type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(part);
      if (!match) throw new Error(`An export list part that the report does not know: ${part}`);
      return { imported: match[2], exported: match[3] ?? match[2], typeOnly: typeOnly || match[1] !== undefined };
    });
}

/** A class without its private members: they are not part of the API. */
function withoutPrivateMembers(statement) {
  return statement
    .split("\n")
    .filter((line) => !/^\s+(?:private\s+(?:static\s+)?(?:readonly\s+)?[\w$]+\??;|#private;)$/.test(line))
    .join("\n");
}

/**
 * This function sorts the statements of the text of one declaration file by their kind. `file`
 * names the file in the errors. An unknown form of statement throws.
 */
export function parseDeclarations(source, file = "<text>") {
  const info = {
    // The declarations of the module by name, exported or not
    locals: new Map(),
    // The names that the module exports from its own scope: the exported name and its local name
    exported: new Map(),
    // `export { a as b } from "x"`
    reexports: [],
    // `export * from "x"`
    stars: [],
    // `export * as name from "x"`
    namespaces: [],
    // The imports by local name: `imported` is a name, `default`, `export=` or `*`
    imports: new Map(),
    // The ambient declarations by label: `declare module "x"`, `declare global`, `export as namespace X`
    ambient: new Map(),
    // Each module specifier that the file names: the files that it reaches
    references: new Set(),
  };
  const addLocal = (name, statement) => info.locals.set(name, [...(info.locals.get(name) ?? []), statement]);
  const addAmbient = (label, statement) => info.ambient.set(label, [...(info.ambient.get(label) ?? []), statement]);
  for (const statement of statementsOf(source)) {
    const flat = statement.replace(/\s+/g, " ");
    for (const found of flat.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) info.references.add(found[1]);
    let match;
    if ((match = /^import (type )?(.+?) from ["']([^"']+)["'];?$/.exec(flat))) {
      const typeOnly = match[1] !== undefined;
      const from = match[3];
      info.references.add(from);
      let clause = match[2].trim();
      const defaultName = /^([\w$]+)\s*(?:,|$)/.exec(clause);
      if (defaultName) {
        info.imports.set(defaultName[1], { from, imported: "default", typeOnly });
        clause = clause.slice(defaultName[0].length).trim();
      }
      const namespace = /^\* as ([\w$]+)$/.exec(clause);
      if (namespace) info.imports.set(namespace[1], { from, imported: "*", typeOnly });
      const braces = /^\{(.*)\}$/.exec(clause);
      if (braces) for (const specifier of specifiersOf(braces[1], typeOnly)) info.imports.set(specifier.exported, { from, imported: specifier.imported, typeOnly: specifier.typeOnly });
      continue;
    }
    if ((match = /^import ["']([^"']+)["'];?$/.exec(flat))) {
      info.references.add(match[1]);
      continue;
    }
    // `import x = require("y")`: the name is the `export =` of the module
    if ((match = /^(export )?import (type )?([\w$]+) = require\(["']([^"']+)["']\);?$/.exec(flat))) {
      info.references.add(match[4]);
      info.imports.set(match[3], { from: match[4], imported: "export=", typeOnly: match[2] !== undefined });
      if (match[1] !== undefined) info.exported.set(match[3], { local: match[3], typeOnly: false });
      continue;
    }
    // `import A = N.B`: an alias of a name of a namespace
    if ((match = /^(export )?import ([\w$]+) = [\w$.]+;?$/.exec(flat))) {
      addLocal(match[2], statement);
      if (match[1] !== undefined) info.exported.set(match[2], { local: match[2], typeOnly: false });
      continue;
    }
    if ((match = /^export (type )?\* as ([\w$]+) from ["']([^"']+)["'];?$/.exec(flat))) {
      info.references.add(match[3]);
      info.namespaces.push({ name: match[2], from: match[3], typeOnly: match[1] !== undefined });
      continue;
    }
    if ((match = /^export (type )?\* from ["']([^"']+)["'];?$/.exec(flat))) {
      info.references.add(match[2]);
      info.stars.push({ from: match[2], typeOnly: match[1] !== undefined });
      continue;
    }
    if ((match = /^export (type )?\{(.*)\} from ["']([^"']+)["'];?$/.exec(flat))) {
      info.references.add(match[3]);
      for (const specifier of specifiersOf(match[2], match[1] !== undefined)) info.reexports.push({ ...specifier, from: match[3] });
      continue;
    }
    if ((match = /^export (type )?\{(.*)\};?$/.exec(flat))) {
      for (const specifier of specifiersOf(match[2], match[1] !== undefined)) info.exported.set(specifier.exported, { local: specifier.imported, typeOnly: specifier.typeOnly });
      continue;
    }
    // `export = X`: the module is the value X (CommonJS)
    if ((match = /^export = ([\w$]+);?$/.exec(flat))) {
      info.exported.set("export=", { local: match[1], typeOnly: false });
      continue;
    }
    if (/^export = /.test(flat)) {
      addLocal("export=", statement);
      info.exported.set("export=", { local: "export=", typeOnly: false });
      continue;
    }
    if ((match = /^(?:export )?declare module (["'][^"']+["'])/.exec(flat))) {
      addAmbient(`declare module ${match[1].replace(/'/g, '"')}`, statement);
      continue;
    }
    if (/^(?:export )?(?:declare )?global \{/.test(flat)) {
      addAmbient("declare global", statement);
      continue;
    }
    if ((match = /^export as namespace ([\w$]+);?$/.exec(flat))) {
      addAmbient(`export as namespace ${match[1]}`, statement);
      continue;
    }
    // `export default x`: the default export is a name of the module
    if ((match = /^export default ([\w$]+);?$/.exec(flat))) {
      info.exported.set("default", { local: match[1], typeOnly: false });
      continue;
    }
    // A default function or class without a name
    match = /^export default (?:declare )?(?:abstract )?(?:class|function\*?)(?![\w$])\s*([\w$]*)/.exec(flat);
    if (match && (match[1] === "" || match[1] === "extends" || match[1] === "implements")) {
      addLocal("default", withoutPrivateMembers(statement));
      info.exported.set("default", { local: "default", typeOnly: false });
      continue;
    }
    // `const a: A, b: B` declares two names
    if ((match = /^(export )?(?:declare )?(?:const|let|var) (?!enum\b)(.*?);?$/.exec(flat))) {
      for (const part of splitTopLevel(match[2])) {
        const name = /^\s*([\w$]+)/.exec(part);
        if (!name) throw new Error(`A declaration that the report does not know, in ${file}:\n${statement}`);
        addLocal(name[1], statement);
        if (match[1] !== undefined) info.exported.set(name[1], { local: name[1], typeOnly: false });
      }
      continue;
    }
    match = /^(export )?(default )?(?:declare )?(?:abstract )?(?:const (?=enum))?(?:function|class|interface|type|enum|namespace|module) ([\w$]+)/.exec(flat);
    if (match) {
      const name = match[3];
      addLocal(name, withoutPrivateMembers(statement));
      if (match[1] !== undefined) info.exported.set(match[2] !== undefined ? "default" : name, { local: name, typeOnly: false });
      continue;
    }
    // `export default <expression>`
    if (/^export default /.test(flat)) {
      addLocal("default", statement);
      info.exported.set("default", { local: "default", typeOnly: false });
      continue;
    }
    throw new Error(`A statement that the report does not know, in ${file}:\n${statement}`);
  }
  return info;
}

/**
 * The declaration file of a JavaScript or declaration path: `a.js` gives `a.d.ts`, `a.mjs` gives
 * `a.d.mts`. The result is undefined for a TypeScript source file and for a file of another kind.
 */
export function declarationPathOf(path) {
  if (/\.d\.[mc]?ts$/.test(path)) return path;
  const js = /\.([mc]?)js$/.exec(path);
  if (js) return `${path.slice(0, -js[0].length)}.d.${js[1]}ts`;
  return undefined;
}

/** True when `subpath` matches the key `pattern` of an `exports` or `imports` field: one `*` or none. */
function patternMatch(pattern, subpath) {
  const star = pattern.indexOf("*");
  if (star < 0) return pattern === subpath ? "" : undefined;
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  if (subpath.length < prefix.length + suffix.length || !subpath.startsWith(prefix) || !subpath.endsWith(suffix)) return undefined;
  return subpath.slice(prefix.length, subpath.length - suffix.length);
}

/**
 * The target of an `exports` value for a TypeScript consumer: the first condition in the order of
 * the object that the consumer knows. The result is `null` for an excluded subpath, and undefined
 * when no condition fits.
 */
export function targetOf(value) {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const target = targetOf(item);
      if (typeof target === "string") return target;
    }
    return undefined;
  }
  if (typeof value === "object") {
    for (const [condition, inner] of Object.entries(value)) {
      if (!CONDITIONS.has(condition)) continue;
      const target = targetOf(inner);
      if (target !== undefined) return target;
    }
  }
  return undefined;
}

/** The `exports` field as a map of subpaths. */
function subpathMap(exportsField) {
  if (typeof exportsField === "string" || Array.isArray(exportsField) || exportsField === null) return { ".": exportsField };
  const keys = Object.keys(exportsField);
  if (keys.length > 0 && keys.every((key) => !key.startsWith("."))) return { ".": exportsField };
  return exportsField;
}

/** Each file under `dir`, relative to `root` with `/`, without `node_modules`. */
function filesUnder(root, dir) {
  const start = join(root, dir);
  if (!existsSync(start) || !statSync(start).isDirectory()) return [];
  const found = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else found.push(relativePath(root, path));
    }
  };
  walk(start);
  return found.sort(byCode);
}

/**
 * The entries of a package for its report, in the order of the `exports` field. Each entry has its
 * subpath and, when it has one, the declaration file (`types`, relative to the package folder).
 * An entry without a declaration file has a `note`. The `./package.json` entry is not part of
 * the API. A subpath pattern (`./*`) gives one entry for each declaration file that it matches.
 */
export function entriesOf(manifest, root) {
  const entries = [];
  const exists = (path) => existsSync(resolve(root, path));
  if (manifest.exports === undefined) {
    // No `exports` field: TypeScript reads `types`, `typings`, then the declaration of `main`
    const field = manifest.types ?? manifest.typings;
    if (typeof field === "string") return [{ subpath: ".", types: field }];
    const main = typeof manifest.main === "string" ? manifest.main : "./index.js";
    const types = declarationPathOf(main);
    if (types && exists(types)) return [{ subpath: ".", types }];
    if (typeof manifest.main === "string") return [{ subpath: ".", note: `no declaration file for main ${manifest.main}` }];
    return [];
  }
  const map = subpathMap(manifest.exports);
  const excluded = Object.entries(map).filter(([, value]) => value === null).map(([key]) => key);
  const isExcluded = (subpath) => excluded.some((pattern) => patternMatch(pattern, subpath) !== undefined);
  for (const [subpath, value] of Object.entries(map)) {
    if (subpath === "./package.json" || value === null) continue;
    const target = targetOf(value);
    if (typeof target !== "string") {
      entries.push({ subpath, note: "no condition for a TypeScript consumer" });
      continue;
    }
    const declared = declarationPathOf(target);
    if (!subpath.includes("*")) {
      if (isExcluded(subpath)) continue;
      if (!declared) entries.push({ subpath, note: `no declaration file for ${target}` });
      // A JavaScript file without a declaration file has no types; a missing build throws later
      else if (declared !== target && !exists(declared) && exists(target)) entries.push({ subpath, note: `no declaration file for ${target}` });
      else entries.push({ subpath, types: declared });
      continue;
    }
    if (!declared || !declared.includes("*")) {
      entries.push({ subpath, note: `no declaration pattern for ${target}` });
      continue;
    }
    const pattern = declared.replace(/^\.\//, "");
    const star = pattern.indexOf("*");
    const folder = pattern.slice(0, star).replace(/[^/]*$/, "");
    const matched = [];
    for (const file of filesUnder(root, folder)) {
      const part = patternMatch(pattern, file);
      if (part === undefined) continue;
      const expanded = subpath.split("*").join(part);
      if (!isExcluded(expanded)) matched.push({ subpath: expanded, types: `./${file}` });
    }
    if (matched.length === 0) entries.push({ subpath, note: `no file matches ${declared}` });
    entries.push(...matched.sort((a, b) => byCode(a.subpath, b.subpath)));
  }
  return entries;
}

/** The reader of the declaration files of one package. */
class Reader {
  #infos = new Map();
  #bindings = new Map();
  #visiting = new Set();

  constructor(root, manifest) {
    this.root = root;
    this.manifest = manifest;
  }

  info(file) {
    let info = this.#infos.get(file);
    if (!info) this.#infos.set(file, (info = parseDeclarations(readFileSync(file, "utf8"), relativePath(this.root, file))));
    return info;
  }

  /** The candidate declaration files of a module path. */
  #candidates(base) {
    const declared = declarationPathOf(base);
    if (declared) return [declared];
    const source = /\.([mc]?)ts$/.exec(base);
    if (source) return [`${base.slice(0, -source[0].length)}.d.${source[1]}ts`];
    return [`${base}.d.ts`, join(base, "index.d.ts")];
  }

  /**
   * The declaration file of a module specifier of `from`: a relative path, or a `#` name of the
   * `imports` field of the package. The result is undefined for a module of another package. A
   * missing file throws, or gives `null` when `soft` is true.
   */
  fileOf(from, specifier, soft = false) {
    let base;
    if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
    else if (specifier.startsWith("#") && this.manifest.imports) {
      for (const [pattern, value] of Object.entries(this.manifest.imports)) {
        const part = patternMatch(pattern, specifier);
        const target = part === undefined ? undefined : targetOf(value);
        if (typeof target === "string" && target.startsWith(".")) {
          base = resolve(this.root, target.split("*").join(part));
          break;
        }
      }
      if (base === undefined) return undefined;
    } else return undefined;
    const file = this.#candidates(base).find((candidate) => existsSync(candidate));
    if (file) return file;
    if (soft) return null;
    throw new Error(`No declaration file for "${specifier}" from ${relativePath(this.root, from)}`);
  }

  /** The binding of `imported` in the module `specifier` of `from`. */
  #bindingIn(from, specifier, imported, typeOnly) {
    const file = this.fileOf(from, specifier);
    if (!file) return { kind: "external", module: specifier, name: imported, typeOnly };
    if (imported === "*") return { kind: "namespace", file, typeOnly };
    const binding = this.exportsOf(file).get(imported);
    if (!binding) throw new Error(`"${specifier}" from ${relativePath(this.root, from)} does not export ${imported}`);
    return typeOnly ? { ...binding, typeOnly: true } : binding;
  }

  /** The names that a module exports, and their bindings. */
  exportsOf(file) {
    const known = this.#bindings.get(file);
    if (known) return known;
    if (this.#visiting.has(file)) return new Map();
    this.#visiting.add(file);
    const info = this.info(file);
    const result = new Map();
    for (const [name, { local, typeOnly }] of info.exported) {
      const imported = info.imports.get(local);
      if (info.locals.has(local)) result.set(name, { kind: "declaration", file, local, typeOnly });
      else if (imported) result.set(name, this.#bindingIn(file, imported.from, imported.imported, typeOnly || imported.typeOnly));
      else throw new Error(`${relativePath(this.root, file)} exports ${local}, and has no declaration or import of it`);
    }
    for (const reexport of info.reexports) result.set(reexport.exported, this.#bindingIn(file, reexport.from, reexport.imported, reexport.typeOnly));
    for (const namespace of info.namespaces) result.set(namespace.name, this.#bindingIn(file, namespace.from, "*", namespace.typeOnly));
    // A name of `export *` never replaces an explicit export, and `default` does not pass
    const explicit = new Set(result.keys());
    for (const { from: star, typeOnly } of info.stars) {
      const target = this.fileOf(file, star);
      if (!target) {
        // The names of another package are not in this package: the report names the package
        const name = `* from "${star}"`;
        if (!result.has(name)) result.set(name, { kind: "external", module: star, name: "*", typeOnly });
        continue;
      }
      // `export type *` gives each name as a type only
      for (const [name, binding] of this.exportsOf(target)) {
        if (name !== "default" && !explicit.has(name) && !result.has(name)) result.set(name, typeOnly ? { ...binding, typeOnly: true } : binding);
      }
    }
    this.#visiting.delete(file);
    this.#bindings.set(file, result);
    return result;
  }

  /**
   * Each declaration file of the package that `file` reaches through its module specifiers, `file`
   * too. A file outside the package folder or in `node_modules` is not part of the package.
   */
  reached(file) {
    const seen = new Set();
    const pending = [file];
    while (pending.length > 0) {
      const next = pending.pop();
      if (seen.has(next)) continue;
      seen.add(next);
      for (const specifier of this.info(next).references) {
        const target = this.fileOf(next, specifier, true);
        if (!target) continue;
        const path = relativePath(this.root, target);
        if (path.startsWith("../") || path.split("/").includes("node_modules")) continue;
        pending.push(target);
      }
    }
    return [...seen];
  }
}

/** The text of the header of a report. */
function header(packageName, tool) {
  return [
    `# The public API of ${packageName}`,
    "#",
    "# The names of each entry of the exports field, and the declaration of each name, without comments",
    `# and private members. The script ${tool} compares this file with the built .d.ts files.`,
    "# To accept a change of the API, start the script with --update and review the diff.",
  ];
}

/**
 * This function gives the report of the public API of a package: for each entry (the subpath and
 * the declaration file, relative to `root`), the exported names, then the declaration of each name.
 * `tool` is the command that the header names.
 */
export function apiReport(packageName, root, entries, { manifest = {}, tool = "scripts/api-report.mjs" } = {}) {
  const reader = new Reader(root, manifest);
  const path = (file) => relativePath(root, file);
  const keyOf = (binding) =>
    binding.kind === "declaration"
      ? `${path(binding.file)}#${binding.local}`
      : binding.kind === "namespace"
        ? `${path(binding.file)}#*`
        : `${binding.module}#${binding.name}`;
  const declarations = new Map();
  const lines = header(packageName, tool);
  if (entries.every((entry) => entry.types === undefined)) {
    lines.push("", "This package has no type declarations: no entry of its package.json gives a .d.ts file.");
  }

  /** The lines of the names of a module, and the names of each namespace in it, with `prefix`. */
  const names = (bindings, prefix, parents, typeOnly) => {
    for (const [name, binding] of [...bindings].sort(([a], [b]) => byCode(a, b))) {
      const key = keyOf(binding);
      const isType = typeOnly || binding.typeOnly;
      lines.push(`${isType ? "type " : ""}${prefix}${name}: ${key}${binding.kind === "declaration" ? "" : ` (${binding.kind})`}`);
      if (binding.kind === "declaration" && !declarations.has(key)) {
        declarations.set(key, reader.info(binding.file).locals.get(binding.local).join("\n"));
      }
      // The names of a namespace are part of the API: `ns.name`
      if (binding.kind === "namespace" && !parents.has(binding.file)) {
        names(reader.exportsOf(binding.file), `${prefix}${name}.`, new Set([...parents, binding.file]), isType);
      }
    }
  };

  for (const entry of entries) {
    if (entry.types === undefined) {
      lines.push("", `## ${entry.subpath}: ${entry.note ?? "no declaration file"}`);
      continue;
    }
    const file = resolve(root, entry.types);
    if (!existsSync(file)) throw new Error(`${entry.subpath}: ${entry.types} is missing. Build the package first.`);
    const bindings = reader.exportsOf(file);
    lines.push("", `## ${entry.subpath} (${path(file)}): ${bindings.size} names`, "");
    names(bindings, "", new Set([file]), false);
    // The ambient declarations of each file that the entry reaches
    const ambient = [];
    for (const reached of reader.reached(file)) {
      for (const [label, statements] of reader.info(reached).ambient) {
        const key = `${path(reached)}#${label}`;
        ambient.push(key);
        if (!declarations.has(key)) declarations.set(key, statements.join("\n"));
      }
    }
    for (const key of ambient.sort(byCode)) lines.push(`ambient: ${key}`);
  }
  if (declarations.size > 0 || entries.some((entry) => entry.types !== undefined)) {
    lines.push("", "## Declarations");
    for (const key of [...declarations.keys()].sort(byCode)) lines.push("", `### ${key}`, declarations.get(key));
  }
  return `${lines.join("\n")}\n`;
}

/** The report of the package in the folder `dir`. */
export function packageReport(dir, options = {}) {
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const name = manifest.name ?? dir.split(sep).at(-1);
  return apiReport(name, dir, entriesOf(manifest, dir), { ...options, manifest });
}

/** The globs of the workspace: `pnpm-workspace.yaml`, then `workspaces` of `package.json`. */
function workspaceGlobs(root) {
  const yaml = join(root, "pnpm-workspace.yaml");
  if (existsSync(yaml)) {
    const lines = readFileSync(yaml, "utf8").split(/\r?\n/);
    const start = lines.findIndex((line) => /^packages\s*:/.test(line));
    if (start >= 0) {
      const unquote = (text) => text.replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
      const inline = /^packages\s*:\s*\[(.*)\]/.exec(lines[start]);
      if (inline) return inline[1].split(",").map(unquote).filter(Boolean);
      const globs = [];
      for (const line of lines.slice(start + 1)) {
        if (/^\s*(#.*)?$/.test(line)) continue;
        const item = /^\s+-\s+(.+)$/.exec(line);
        if (!item) break;
        globs.push(unquote(item[1]));
      }
      return globs;
    }
  }
  const manifestFile = join(root, "package.json");
  if (existsSync(manifestFile)) {
    const { workspaces } = JSON.parse(readFileSync(manifestFile, "utf8"));
    if (Array.isArray(workspaces)) return workspaces;
    if (Array.isArray(workspaces?.packages)) return workspaces.packages;
  }
  return undefined;
}

/** The folders that a glob of the workspace names: `a`, `a/*` or `a/**`. */
function foldersOf(root, glob) {
  const clean = glob.replace(/^\.\//, "").replace(/\/$/, "");
  const recursive = /\/\*\*$/.exec(clean);
  const single = /\/\*$/.exec(clean);
  if (!recursive && !single) {
    if (clean.includes("*")) throw new Error(`A workspace glob that the report does not know: ${glob}`);
    return [join(root, clean)];
  }
  const base = join(root, clean.slice(0, -(recursive ?? single)[0].length));
  if (!existsSync(base)) return [];
  const found = [];
  const walk = (folder, deep) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      found.push(join(folder, entry.name));
      if (deep) walk(join(folder, entry.name), deep);
    }
  };
  walk(base, Boolean(recursive));
  return found;
}

/**
 * The package folders of the repository at `root`: the folders of the workspace globs with a
 * package.json, or `root` itself when it has no workspace. The order is the order of the paths.
 */
export function packageFolders(root) {
  const globs = workspaceGlobs(root);
  if (globs === undefined) return existsSync(join(root, "package.json")) ? [root] : [];
  const included = new Set();
  for (const glob of globs.filter((glob) => !glob.startsWith("!"))) for (const folder of foldersOf(root, glob)) included.add(folder);
  for (const glob of globs.filter((glob) => glob.startsWith("!"))) for (const folder of foldersOf(root, glob.slice(1))) included.delete(folder);
  return [...included].filter((folder) => existsSync(join(folder, "package.json"))).sort(byCode);
}
