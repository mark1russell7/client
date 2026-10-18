/**
 * lib.importCycles procedure (Graph's split, wave 2, W7)
 *
 * The import cycles of a tree of TypeScript sources. The default mode counts the cycles that exist
 * at runtime: TypeScript's own import elision drops an import whose bindings are only types, as the
 * build drops it. Then the strongly connected components of the graph are the cycles that can break
 * the order of the module initialization.
 *
 * - `runtime` (the default): the imports that survive the elision, and the dependency-injection
 *   tokens of the decorators in `diDecorators` (Angular: a decorated class keeps the types of its
 *   constructor parameters at runtime).
 * - `declared`: each import that the source does not declare type-only (`import type`). A cycle of
 *   this mode holds only because the elision catches an import of types.
 * - `raw`: each import statement. This is the count of a tool such as madge.
 *
 * The procedure reads the files with `fs.glob` and `fs.read`, so a root of the host confines it. The
 * functions `importGraph` and `importCycles` take the sources as text, for a caller with its own files.
 */
import { posix } from "node:path";
import { ts } from "ts-morph";
import type { ProcedureContext } from "@procedures/client";
import type { ImportMode, LibImportCyclesInput, LibImportCyclesOutput } from "../../types.js";
import { findCycles } from "./graph.js";

/** The decorators of Angular whose class keeps the types of its constructor parameters at runtime. */
export const ANGULAR_DI_DECORATORS: readonly string[] = Object.freeze(["Injectable", "Component", "Directive", "Pipe", "NgModule"]);

/** The files that the procedure leaves out by default: the tests, the declarations and node_modules. */
export const DEFAULT_IMPORT_EXCLUDE: readonly string[] = Object.freeze(["**/node_modules/**", "**/*.d.ts", "**/*.{spec,test,unit}.{ts,tsx}"]);

/** The limits of `lib.importCycles`. The defaults are the ceiling: a caller can only ask for lower limits. */
export interface ImportCycleLimits {
  /** The most files that one call reads. A call with more files is refused before it reads a file. The default is 20000. */
  readonly maxFiles: number;
  /** The largest file that the call reads, in bytes. A larger file is skipped, and the result lists it. The default is 1 MiB. */
  readonly maxFileBytes: number;
}

/** The default limits of `lib.importCycles`. */
export const DEFAULT_IMPORT_CYCLE_LIMITS: ImportCycleLimits = Object.freeze({ maxFiles: 20_000, maxFileBytes: 1024 * 1024 });

/** The options of `importGraph` and `importCycles`. */
export interface ImportGraphOptions {
  /** `runtime` (the default), `declared` or `raw`. */
  readonly mode?: ImportMode | undefined;
  /** The decorators whose class keeps the types of its constructor parameters at runtime. The default is none. */
  readonly diDecorators?: readonly string[] | undefined;
  /** An abort signal: the functions examine it before each file, and stop with its reason. */
  readonly signal?: AbortSignal | undefined;
}

/** The result of `importCycles`. */
export interface ImportCycles {
  /** The number of files. */
  readonly files: number;
  /** The number of import edges between the files. */
  readonly edges: number;
  /** Each cycle: the files of a strongly connected component, in name order. The largest cycle comes first. */
  readonly components: string[][];
  /** The number of files in a cycle. */
  readonly filesInCycles: number;
}

/** True when the source declares the import or export type-only: `import type`, or only `type` names. */
function declaredTypeOnly(statement: ts.ImportDeclaration | ts.ExportDeclaration): boolean {
  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause;
    if (!clause) return false; // an import for its side effects runs
    if (clause.isTypeOnly) return true;
    if (clause.name) return false;
    const bindings = clause.namedBindings;
    return !!bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly);
  }
  return statement.isTypeOnly;
}

/** The module specifiers of the statements of a source. */
function specifiersOf(source: ts.SourceFile, skip: (statement: ts.ImportDeclaration | ts.ExportDeclaration) => boolean): Set<string> {
  const specifiers = new Set<string>();
  for (const statement of source.statements) {
    if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      if (!skip(statement)) specifiers.add(statement.moduleSpecifier.text);
    }
  }
  return specifiers;
}

/** The specifiers of the dependency-injection tokens: the types of the constructor parameters of a decorated class. */
function diSpecifiers(source: ts.SourceFile, decorators: ReadonlySet<string>): Set<string> {
  const importOf = new Map<string, string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || !statement.importClause || statement.importClause.isTypeOnly) continue;
    const bindings = statement.importClause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) if (!element.isTypeOnly) importOf.set(element.name.text, statement.moduleSpecifier.text);
    }
    if (statement.importClause.name) importOf.set(statement.importClause.name.text, statement.moduleSpecifier.text);
  }
  const out = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node)) {
      const decorated = (ts.getDecorators(node) ?? []).some((decorator) => {
        const expression = decorator.expression;
        return ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && decorators.has(expression.expression.text);
      });
      if (decorated) {
        for (const member of node.members) {
          if (!ts.isConstructorDeclaration(member)) continue;
          for (const parameter of member.parameters) {
            const type = parameter.type;
            if (type && ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
              const specifier = importOf.get(type.typeName.text);
              if (specifier) out.add(specifier);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** The file of a relative specifier among the known files, or undefined. A `.js` specifier of an ES module maps to its `.ts` source. */
function resolveSpecifier(from: string, specifier: string, files: ReadonlySet<string>): string | undefined {
  if (!specifier.startsWith(".")) return undefined; // a package import cannot make a cycle of the tree
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
  if (base.endsWith(".js")) candidates.push(`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`);
  return candidates.find((candidate) => files.has(candidate));
}

/** The edges of one source in a mode. */
function edgesOf(file: string, text: string, files: ReadonlySet<string>, mode: ImportMode, decorators: ReadonlySet<string>): string[] {
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  let specifiers: Set<string>;
  if (mode === "runtime") {
    // The elision of TypeScript: an import whose bindings are only types leaves the output
    const output = ts.transpileModule(text, {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        experimentalDecorators: true,
        useDefineForClassFields: false,
        verbatimModuleSyntax: false,
        isolatedModules: true,
      },
    }).outputText;
    specifiers = specifiersOf(ts.createSourceFile("out.js", output, ts.ScriptTarget.ES2022, false, ts.ScriptKind.JS), () => false);
    if (decorators.size > 0) for (const specifier of diSpecifiers(ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, kind), decorators)) specifiers.add(specifier);
  } else {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, false, kind);
    specifiers = specifiersOf(source, mode === "declared" ? declaredTypeOnly : () => false);
  }
  const edges: string[] = [];
  for (const specifier of specifiers) {
    const target = resolveSpecifier(file, specifier, files);
    if (target && !edges.includes(target)) edges.push(target);
  }
  return edges;
}

/**
 * This function gives the import graph of the sources: for each file, the files that it imports in the mode. The
 * paths are POSIX paths, relative to one root. Only relative imports make edges.
 */
export function importGraph(sources: ReadonlyMap<string, string>, options: ImportGraphOptions = {}): Map<string, string[]> {
  const files = new Set(sources.keys());
  const decorators = new Set(options.diDecorators ?? []);
  const mode = options.mode ?? "runtime";
  const graph = new Map<string, string[]>();
  for (const [file, text] of sources) {
    options.signal?.throwIfAborted();
    graph.set(file, edgesOf(file, text, files, mode, decorators));
  }
  return graph;
}

/**
 * This function gives the import cycles of the sources: the strongly connected components of `importGraph`.
 *
 * @example
 * ```ts
 * const sources = new Map([["src/a.ts", "import { b } from './b';"], ["src/b.ts", "import { a } from './a';"]]);
 * importCycles(sources).components; // [["src/a.ts", "src/b.ts"]]
 * ```
 */
export function importCycles(sources: ReadonlyMap<string, string>, options: ImportGraphOptions = {}): ImportCycles {
  const graph = importGraph(sources, options);
  // The largest cycle first, then the order of the code units of the first file
  const components = findCycles([...graph.keys()], graph).sort((a, b) => b.length - a.length || (a[0]! < b[0]! ? -1 : a[0]! > b[0]! ? 1 : 0));
  let edges = 0;
  for (const targets of graph.values()) edges += targets.length;
  return { files: graph.size, edges, components, filesInCycles: components.reduce((n, component) => n + component.length, 0) };
}

interface FsGlobOutput {
  matches: string[];
}

function tooManyFiles(count: number, maxFiles: number): Error {
  return Object.assign(new Error(`The folder has ${count} source files, more than the limit of ${maxFiles}. Give a narrower path or exclude patterns.`), {
    code: "PAYLOAD_TOO_LARGE",
    retryable: false,
  });
}

/**
 * The import cycles of the TypeScript sources under a folder
 */
export async function libImportCycles(input: LibImportCyclesInput, ctx: ProcedureContext): Promise<LibImportCyclesOutput> {
  const exclude = input.exclude ?? [...DEFAULT_IMPORT_EXCLUDE];
  // The meet of the caller's limits and the ceiling, for each field: a caller only narrows them (the schema
  // also refuses a higher value)
  const limits: ImportCycleLimits = {
    maxFiles: Math.min(input.limits?.maxFiles ?? Infinity, DEFAULT_IMPORT_CYCLE_LIMITS.maxFiles),
    maxFileBytes: Math.min(input.limits?.maxFileBytes ?? Infinity, DEFAULT_IMPORT_CYCLE_LIMITS.maxFileBytes),
  };
  const { matches } = await ctx.client.call<{ pattern: string; cwd: string; ignore: string[] }, FsGlobOutput>(["fs", "glob"], {
    pattern: "**/*.{ts,tsx}",
    cwd: input.path,
    ignore: exclude,
  });
  // The limit comes before any read: a call cannot make the host read a whole node_modules
  if (matches.length > limits.maxFiles) throw tooManyFiles(matches.length, limits.maxFiles);
  const root = input.path.split("\\").join("/");
  const sources = new Map<string, string>();
  const skipped: Array<{ path: string; bytes: number }> = [];
  for (const match of matches.map((m) => m.split("\\").join("/")).sort()) {
    ctx.signal?.throwIfAborted();
    const path = posix.join(root, match);
    const { size } = await ctx.client.call<{ path: string }, { size: number }>(["fs", "stat"], { path });
    if (size > limits.maxFileBytes) {
      skipped.push({ path: match, bytes: size });
      continue;
    }
    const { content } = await ctx.client.call<{ path: string }, { content: string }>(["fs", "read"], { path });
    sources.set(match, content);
  }
  const mode = input.mode ?? "runtime";
  const result = importCycles(sources, { mode, diDecorators: input.diDecorators, signal: ctx.signal });
  return { path: input.path, mode, ...result, acyclic: result.components.length === 0, skipped };
}
