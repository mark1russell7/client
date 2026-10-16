/**
 * The report of the public API of a package, from its `.d.ts` files (roadmap R30).
 *
 * The report lists the names that each entry of the `exports` field gives, and the declaration of
 * each name. It follows `export *`, `export { a as b } from` and the imports that a module
 * exports again. The report has no comments and no private members, so a change of a comment
 * or of a private field does not change it. The text is the same on Windows and on Linux: the
 * line ends are LF, the paths use `/`, and the sort does not use the locale.
 *
 * TypeScript 7 has no stable compiler API, so this file reads the declaration files as text.
 * The declaration emit of `tsc` is regular, and an unknown form of statement throws.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/** A name that a module gives: a declaration, a namespace of a module, or a name of another package. */
type Binding =
  | { readonly kind: "declaration"; readonly file: string; readonly local: string; readonly typeOnly: boolean }
  | { readonly kind: "namespace"; readonly file: string; readonly typeOnly: boolean }
  | { readonly kind: "external"; readonly module: string; readonly name: string; readonly typeOnly: boolean };

/** One name of an export list: `type a as b`. */
interface Specifier {
  readonly imported: string;
  readonly exported: string;
  readonly typeOnly: boolean;
}

/** The statements of one declaration file. */
interface ModuleInfo {
  /** The declarations of the module by name, exported or not */
  readonly locals: Map<string, string[]>;
  /** The names that the module exports from its own scope: the exported name and its local name */
  readonly exported: Map<string, { local: string; typeOnly: boolean }>;
  /** `export { a as b } from "x"` */
  readonly reexports: Array<Specifier & { from: string }>;
  /** `export * from "x"` */
  readonly stars: string[];
  /** `export * as name from "x"` */
  readonly namespaces: Array<{ name: string; from: string }>;
  /** The imports by local name: `imported` is a name, `default` or `*` */
  readonly imports: Map<string, { from: string; imported: string; typeOnly: boolean }>;
}

/** The order of the code units: the same on each machine. */
const byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * This function splits the text of a declaration file into its top-level statements, without
 * the comments, the blank lines and the spaces at the ends of the lines.
 */
export function statementsOf(source: string): string[] {
  const text = source.replace(/\r\n?/g, "\n");
  const statements: string[] = [];
  let current = "";
  let depth = 0;
  /** The depth of the type arguments at the top level: `class A<T = {}> {` has a brace in them */
  let angle = 0;
  /** True when the body of a class, an interface, an enum or a namespace is open */
  let body = false;
  /** The template literals and their `${ }` parts, from the outside in */
  const modes: Array<{ kind: "template" } | { kind: "part"; depth: number }> = [];
  const blockHeader = /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+class|class|interface|const\s+enum|enum|namespace|module|global)\b/;

  const finish = (): void => {
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
    const char = text[index]!;
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

/** The names of an export or import list: `a, type b, c as d`. */
function specifiersOf(list: string, typeOnly: boolean): Specifier[] {
  return list
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => {
      const match = /^(type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(part);
      if (!match) throw new Error(`An export list part that the report does not know: ${part}`);
      return { imported: match[2]!, exported: match[3] ?? match[2]!, typeOnly: typeOnly || match[1] !== undefined };
    });
}

/** The statements of a declaration file, by their kind. */
function parse(file: string): ModuleInfo {
  const info: ModuleInfo = { locals: new Map(), exported: new Map(), reexports: [], stars: [], namespaces: [], imports: new Map() };
  for (const statement of statementsOf(readFileSync(file, "utf8"))) {
    const flat = statement.replace(/\s+/g, " ");
    let match: RegExpExecArray | null;
    if ((match = /^import (type )?(.+?) from ["']([^"']+)["'];?$/.exec(flat))) {
      const typeOnly = match[1] !== undefined;
      const from = match[3]!;
      let clause = match[2]!.trim();
      const namespace = /^\* as ([\w$]+)$/.exec(clause);
      if (namespace) {
        info.imports.set(namespace[1]!, { from, imported: "*", typeOnly });
        continue;
      }
      const defaultName = /^([\w$]+)\s*(?:,|$)/.exec(clause);
      if (defaultName) {
        info.imports.set(defaultName[1]!, { from, imported: "default", typeOnly });
        clause = clause.slice(defaultName[0].length).trim();
      }
      const braces = /^\{(.*)\}$/.exec(clause);
      if (braces) for (const specifier of specifiersOf(braces[1]!, typeOnly)) info.imports.set(specifier.exported, { from, imported: specifier.imported, typeOnly: specifier.typeOnly });
      continue;
    }
    if (/^import ["'][^"']+["'];?$/.test(flat)) continue;
    if ((match = /^export \* as ([\w$]+) from ["']([^"']+)["'];?$/.exec(flat))) {
      info.namespaces.push({ name: match[1]!, from: match[2]! });
      continue;
    }
    if ((match = /^export \* from ["']([^"']+)["'];?$/.exec(flat))) {
      info.stars.push(match[1]!);
      continue;
    }
    if ((match = /^export (type )?\{(.*)\} from ["']([^"']+)["'];?$/.exec(flat))) {
      for (const specifier of specifiersOf(match[2]!, match[1] !== undefined)) info.reexports.push({ ...specifier, from: match[3]! });
      continue;
    }
    if ((match = /^export (type )?\{(.*)\};?$/.exec(flat))) {
      for (const specifier of specifiersOf(match[2]!, match[1] !== undefined)) info.exported.set(specifier.exported, { local: specifier.imported, typeOnly: specifier.typeOnly });
      continue;
    }
    if (/^(?:export )?(?:declare )?global \{/.test(flat) || /^export as namespace /.test(flat)) continue;
    match = /^(export )?(default )?(?:declare )?(?:abstract )?(?:const (?=enum))?(?:function|class|interface|type|const|let|var|enum|namespace|module) ([\w$]+)/.exec(flat);
    if (match) {
      const name = match[3]!;
      info.locals.set(name, [...(info.locals.get(name) ?? []), withoutPrivateMembers(statement)]);
      if (match[1] !== undefined) info.exported.set(match[2] !== undefined ? "default" : name, { local: name, typeOnly: false });
      continue;
    }
    throw new Error(`A statement that the report does not know, in ${file}:\n${statement}`);
  }
  return info;
}

/** A class without its private members: they are not part of the API. */
function withoutPrivateMembers(statement: string): string {
  return statement
    .split("\n")
    .filter((line) => !/^\s+(?:private\s+(?:static\s+)?(?:readonly\s+)?[\w$]+\??;|#private;)$/.test(line))
    .join("\n");
}

/** The declaration file of a module specifier, or undefined for a module of another package. */
function fileOf(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = resolve(dirname(from), specifier);
  const candidates = /\.js$/.test(base) ? [base.replace(/\.js$/, ".d.ts")] : [`${base}.d.ts`, join(base, "index.d.ts")];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) throw new Error(`No declaration file for "${specifier}" from ${from}`);
  return file;
}

/** The reader of the declaration files of one package. */
class Reader {
  private readonly infos = new Map<string, ModuleInfo>();
  private readonly bindings = new Map<string, Map<string, Binding>>();
  private readonly visiting = new Set<string>();

  info(file: string): ModuleInfo {
    let info = this.infos.get(file);
    if (!info) this.infos.set(file, (info = parse(file)));
    return info;
  }

  /** The binding of `imported` in the module `specifier` of `from`. */
  private bindingIn(from: string, specifier: string, imported: string, typeOnly: boolean): Binding {
    const file = fileOf(from, specifier);
    if (!file) return { kind: "external", module: specifier, name: imported, typeOnly };
    if (imported === "*") return { kind: "namespace", file, typeOnly };
    const binding = this.exportsOf(file).get(imported);
    if (!binding) throw new Error(`"${specifier}" from ${from} does not export ${imported}`);
    return typeOnly ? { ...binding, typeOnly: true } : binding;
  }

  /** The names that a module exports, and their bindings. */
  exportsOf(file: string): Map<string, Binding> {
    const known = this.bindings.get(file);
    if (known) return known;
    if (this.visiting.has(file)) return new Map();
    this.visiting.add(file);
    const info = this.info(file);
    const result = new Map<string, Binding>();
    for (const [name, { local, typeOnly }] of info.exported) {
      const imported = info.imports.get(local);
      if (info.locals.has(local)) result.set(name, { kind: "declaration", file, local, typeOnly });
      else if (imported) result.set(name, this.bindingIn(file, imported.from, imported.imported, typeOnly || imported.typeOnly));
      else throw new Error(`${file} exports ${local}, and has no declaration or import of it`);
    }
    for (const reexport of info.reexports) result.set(reexport.exported, this.bindingIn(file, reexport.from, reexport.imported, reexport.typeOnly));
    for (const namespace of info.namespaces) result.set(namespace.name, this.bindingIn(file, namespace.from, "*", false));
    // A name of `export *` never replaces an explicit export, and `default` does not pass
    const explicit = new Set(result.keys());
    for (const star of info.stars) {
      const target = fileOf(file, star);
      if (!target) throw new Error(`export * from another package (${star}) in ${file}`);
      for (const [name, binding] of this.exportsOf(target)) {
        if (name !== "default" && !explicit.has(name) && !result.has(name)) result.set(name, binding);
      }
    }
    this.visiting.delete(file);
    this.bindings.set(file, result);
    return result;
  }
}

/**
 * This function gives the report of the public API of a package: for each entry of `entries`
 * (the subpath and the declaration file), the exported names, then the declaration of each name.
 */
export function apiReport(packageName: string, root: string, entries: ReadonlyArray<{ subpath: string; types: string }>): string {
  const reader = new Reader();
  const path = (file: string): string => relative(root, file).split(sep).join("/");
  const keyOf = (binding: Binding): string =>
    binding.kind === "declaration"
      ? `${path(binding.file)}#${binding.local}`
      : binding.kind === "namespace"
        ? `${path(binding.file)}#*`
        : `${binding.module}#${binding.name}`;
  const declarations = new Map<string, string>();
  const lines: string[] = [
    `# The public API of ${packageName}`,
    "#",
    "# The names of each entry of the exports field, and the declaration of each name, without comments",
    "# and private members. The test src/api.snapshot.test.ts compares this file with the .d.ts files of",
    "# dist/. To accept a change of the API, start the test with UPDATE_API_SNAPSHOT=1 and review the diff.",
  ];
  for (const entry of entries) {
    const file = resolve(root, entry.types);
    const names = [...reader.exportsOf(file)].sort(([a], [b]) => byCode(a, b));
    lines.push("", `## ${entry.subpath} (${path(file)}): ${names.length} names`, "");
    for (const [name, binding] of names) {
      // The key names the declaration: its file and its local name, which an alias changes
      const key = keyOf(binding);
      lines.push(`${binding.typeOnly ? "type " : ""}${name}: ${key}${binding.kind === "declaration" ? "" : ` (${binding.kind})`}`);
      if (binding.kind === "declaration" && !declarations.has(key)) {
        declarations.set(key, reader.info(binding.file).locals.get(binding.local)!.join("\n"));
      }
    }
  }
  lines.push("", "## Declarations");
  for (const key of [...declarations.keys()].sort(byCode)) lines.push("", `### ${key}`, declarations.get(key)!);
  return `${lines.join("\n")}\n`;
}
