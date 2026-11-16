/**
 * The generator of an exports manifest: the procedures of a package from its declaration files.
 *
 * It reads the entry `.d.ts` file of a package with the type checker of TypeScript. It gives a
 * procedure for each public function whose inputs and output are JSON. The schemas come from the
 * types, and the descriptions come from the doc comments.
 *
 * TypeScript 7 has no compiler API in JavaScript. So this module reads the compiler API of
 * TypeScript 5 as the package `typescript-api` (`npm:typescript@^5.9.3`), as the site of this
 * repository does. A user of this entry installs that package. The end of this shortcut: the
 * stable API of TypeScript 7.
 */

import ts from "typescript-api";
import type * as TS from "typescript-api";
import type { Effects } from "@procedures/client/browser";
import {
  EXPORTS_MANIFEST_FORMAT,
  type ExportExemption,
  type ExportProcedure,
  type ExportsJsonSchema,
  type ExportsManifest,
} from "./types.js";

/** The data that a package adds to the generated manifest: the overlay. */
export interface ExportsOverlay {
  /** The effects of each procedure. Absent: unknown. A package of pure functions gives `{ reads: [], writes: [] }`. */
  readonly effects?: Effects;
  /** The changes for single functions, by the name of the export. */
  readonly functions?: Readonly<Record<string, ExportsFunctionOverlay>>;
}

/** The overlay of one function. */
export interface ExportsFunctionOverlay {
  /** The effects of this function, in place of the effects of the package. */
  readonly effects?: Effects;
  /** The reason why this function has no procedure. */
  readonly exempt?: string;
}

/** The options of `generateExportsManifest()`. */
export interface GenerateExportsOptions {
  /** The path of the entry declaration file, for example `node_modules/<package>/build/index.d.ts`. */
  readonly declarations: string;
  /** The npm name of the package. */
  readonly package: string;
  /** The version of the package. */
  readonly version?: string;
  /** The entry of the package. The default is `.`. */
  readonly entry?: string;
  /** The first segments of the path of each procedure. */
  readonly namespace: readonly string[];
  /** The data that the package adds. */
  readonly overlay?: ExportsOverlay;
}

/** A type that is not JSON: the reason and the type, for the exemption. */
class NotJson extends Error {
  readonly what: string;
  readonly isFunction: boolean;
  /** The names of the properties from the parameter or the output to the type. */
  readonly path: readonly string[];
  constructor(what: string, isFunction: boolean, path: readonly string[] = []) {
    super(what);
    this.what = what;
    this.isFunction = isFunction;
    this.path = path;
  }

  /** The same error, one property deeper. */
  inside(property: string): NotJson {
    return new NotJson(this.what, this.isFunction, [property, ...this.path]);
  }

  /** The text of the exemption, for example `options.compare: (a: number) => number`. */
  detail(root?: string): string {
    const path = root === undefined ? this.path : [root, ...this.path];
    return path.length ? `${path.join(".")}: ${this.what}` : this.what;
  }
}

/** The names of the global object types that have no JSON form. */
const NOT_JSON_GLOBALS = new Set([
  "Date", "Map", "Set", "WeakMap", "WeakSet", "WeakRef", "RegExp", "Promise", "Error",
  "ArrayBuffer", "SharedArrayBuffer", "DataView", "Uint8Array", "Uint8ClampedArray", "Int8Array",
  "Uint16Array", "Int16Array", "Uint32Array", "Int32Array", "Float32Array", "Float64Array",
  "BigInt64Array", "BigUint64Array", "ReadableStream", "WritableStream", "AbortSignal",
  "AbortController", "Blob", "URL", "Iterator", "IterableIterator", "Generator", "AsyncGenerator",
  "AsyncIterable", "AsyncIterableIterator", "Iterable", "Symbol",
]);

/**
 * This function reads the entry declaration file of a package and gives its exports manifest.
 * The order of the procedures and of the exemptions is the order of the names, so the output is
 * the same on each run.
 */
export function generateExportsManifest(options: GenerateExportsOptions): ExportsManifest {
  const compilerOptions: TS.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    // The types of Node.js resolve the node: modules, for example DatabaseSync of node:sqlite
    types: ["node"],
  };
  // The folder of the declarations is the current folder, so the type roots are the folders above it
  const host = ts.createCompilerHost(compilerOptions, true);
  const resolved = ts.sys.resolvePath(options.declarations).split("\\").join("/");
  const folder = resolved.slice(0, resolved.lastIndexOf("/"));
  host.getCurrentDirectory = () => folder;
  const program = ts.createProgram({ rootNames: [options.declarations], options: compilerOptions, host });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(options.declarations);
  if (!source) throw new Error(`The declaration file ${options.declarations} is not readable`);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) throw new Error(`The declaration file ${options.declarations} is not a module`);

  const defs = new Map<string, ExportsJsonSchema>();
  const defNames = new Map<TS.Type, string>();
  const procedures: ExportProcedure[] = [];
  const exempt: ExportExemption[] = [];
  const classes: string[] = [];
  let values = 0;
  let types = 0;
  const overlay = options.overlay ?? {};

  const exports = [...checker.getExportsOfModule(moduleSymbol)].sort((a, b) => compare(a.name, b.name));
  for (const exported of exports) {
    const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const name = exported.name;
    if (symbol.flags & ts.SymbolFlags.Class) {
      classes.push(name);
      continue;
    }
    const isFunction = (symbol.flags & ts.SymbolFlags.Function) !== 0;
    const isValue = (symbol.flags & ts.SymbolFlags.Variable) !== 0;
    if (!isFunction && !isValue) {
      if (symbol.flags & (ts.SymbolFlags.Type | ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Enum)) types++;
      continue;
    }
    const type = checker.getTypeOfSymbolAtLocation(symbol, source);
    const signatures = type.getCallSignatures();
    if (signatures.length === 0) {
      values++;
      continue;
    }
    const functionOverlay = overlay.functions?.[name];
    if (functionOverlay?.exempt !== undefined) {
      exempt.push({ name, reason: "overlay", detail: functionOverlay.exempt });
      continue;
    }
    if (signatures.length > 1) {
      exempt.push({ name, reason: "overload", detail: `${signatures.length} signatures` });
      continue;
    }
    const signature = signatures[0]!;
    const result = procedureOf(name, symbol, signature);
    if ("reason" in result) {
      exempt.push(result);
      continue;
    }
    const effects = functionOverlay?.effects ?? overlay.effects;
    procedures.push(effects ? { ...result, effects } : result);
  }

  return {
    format: EXPORTS_MANIFEST_FORMAT,
    package: options.package,
    ...(options.version !== undefined ? { version: options.version } : {}),
    entry: options.entry ?? ".",
    namespace: [...options.namespace],
    $defs: Object.fromEntries([...defs.entries()].sort(([a], [b]) => compare(a, b))),
    procedures,
    exempt,
    others: { classes, values, types },
  };

  function procedureOf(name: string, symbol: TS.Symbol, signature: TS.Signature): ExportProcedure | ExportExemption {
    const generics = (signature.getTypeParameters() ?? []).map((parameter) => parameter.symbol.name);
    const params: string[] = [];
    const properties: Record<string, ExportsJsonSchema> = {};
    const required: string[] = [];
    let rest: string | undefined;
    for (const [index, parameter] of signature.getParameters().entries()) {
      const parameterDeclaration = parameter.valueDeclaration;
      if (!parameterDeclaration || !ts.isParameter(parameterDeclaration)) {
        return { name, reason: "input-not-json", detail: `the parameter ${parameter.name} has no declaration` };
      }
      const parameterName = ts.isIdentifier(parameterDeclaration.name) ? parameterDeclaration.name.text : `arg${index}`;
      const parameterType = checker.getTypeOfSymbolAtLocation(parameter, parameterDeclaration);
      let schema: ExportsJsonSchema;
      try {
        schema = schemaOf(parameterType, false);
      } catch (error) {
        if (!(error instanceof NotJson)) throw error;
        return {
          name,
          reason: error.isFunction ? "function-parameter" : "input-not-json",
          detail: error.detail(parameterName),
        };
      }
      const description = text(parameter.getDocumentationComment(checker));
      properties[parameterName] = description ? { ...schema, description } : schema;
      if (parameterDeclaration.dotDotDotToken) rest = parameterName;
      else params.push(parameterName);
      const optional = checker.isOptionalParameter(parameterDeclaration) || parameterDeclaration.dotDotDotToken !== undefined;
      if (!optional) required.push(parameterName);
    }

    let returnType = signature.getReturnType();
    let isAsync = false;
    const awaited = promisedType(returnType);
    if (awaited) {
      returnType = awaited;
      isAsync = true;
    }
    let output: ExportsJsonSchema;
    try {
      output = returnType.flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined) ? { type: "null" } : schemaOf(returnType, true);
    } catch (error) {
      if (!(error instanceof NotJson)) throw error;
      return { name, reason: "output-not-json", detail: error.detail() };
    }

    const description = firstParagraph(text(symbol.getDocumentationComment(checker)));
    return {
      name,
      path: [...options.namespace, name],
      ...(description ? { description } : {}),
      params,
      ...(rest !== undefined ? { rest } : {}),
      input: { type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false },
      output,
      ...(isAsync ? { async: true as const } : {}),
      ...(generics.length ? { generics } : {}),
    };
  }

  function promisedType(type: TS.Type): TS.Type | undefined {
    const symbol = type.getSymbol();
    if (symbol?.name !== "Promise" && symbol?.name !== "PromiseLike") return undefined;
    const [awaited] = checker.getTypeArguments(type as TS.TypeReference);
    return awaited;
  }

  /**
   * The schema of a type. `output` is true for the output and its items: there an `undefined`
   * member gives `null`, as in JSON. A property with an `undefined` member is optional.
   */
  function schemaOf(type: TS.Type, output: boolean): ExportsJsonSchema {
    const flags = type.flags;
    // A type that does not resolve is the error type of the checker: the check fails closed
    if (flags & ts.TypeFlags.Any && (type as { intrinsicName?: string }).intrinsicName === "error") {
      throw new NotJson("a type that does not resolve", false);
    }
    if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return {};
    if (flags & ts.TypeFlags.Never) throw new NotJson("never", false);
    if (flags & ts.TypeFlags.StringLiteral) return { const: (type as TS.StringLiteralType).value };
    if (flags & ts.TypeFlags.NumberLiteral) return { const: (type as TS.NumberLiteralType).value };
    if (flags & ts.TypeFlags.BooleanLiteral) return { const: checker.typeToString(type) === "true" };
    if (flags & (ts.TypeFlags.String | ts.TypeFlags.TemplateLiteral | ts.TypeFlags.StringMapping)) return { type: "string" };
    if (flags & ts.TypeFlags.Number) return { type: "number" };
    if (flags & ts.TypeFlags.Boolean) return { type: "boolean" };
    if (flags & ts.TypeFlags.Null) return { type: "null" };
    if (flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) {
      if (output) return { type: "null" };
      throw new NotJson("undefined", false);
    }
    if (flags & (ts.TypeFlags.BigInt | ts.TypeFlags.BigIntLiteral)) throw new NotJson("bigint", false);
    if (flags & (ts.TypeFlags.ESSymbol | ts.TypeFlags.UniqueESSymbol)) throw new NotJson("symbol", false);
    if (flags & ts.TypeFlags.TypeParameter) {
      const constraint = checker.getBaseConstraintOfType(type);
      return constraint && constraint !== type && !(constraint.flags & ts.TypeFlags.Unknown) ? schemaOf(constraint, output) : {};
    }
    if (type.isUnion()) return unionSchema(type, output);
    if (flags & ts.TypeFlags.NonPrimitive) return { type: "object" };
    if (type.isIntersection() || flags & ts.TypeFlags.Object) return objectSchema(type, output);
    throw new NotJson(checker.typeToString(type), false);
  }

  function unionSchema(type: TS.UnionType, output: boolean): ExportsJsonSchema {
    let members = type.types;
    // An optional property or parameter has `T | undefined`: its schema is the schema of T
    const defined = members.filter((member) => !(member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)));
    const hasUndefined = defined.length < members.length;
    members = defined;
    // `boolean` is the union `true | false`
    const booleans = members.filter((member) => member.flags & ts.TypeFlags.BooleanLiteral);
    const others = members.filter((member) => !(member.flags & ts.TypeFlags.BooleanLiteral));
    const schemas: ExportsJsonSchema[] = booleans.length === 2 ? [{ type: "boolean" }] : booleans.map((member) => schemaOf(member, output));
    for (const member of others) schemas.push(schemaOf(member, output));
    if (hasUndefined && output) schemas.push({ type: "null" });
    // A member that is any JSON value makes the union any JSON value
    if (schemas.some((schema) => Object.keys(schema).length === 0)) return {};
    if (schemas.length === 1) return schemas[0]!;
    const isNull = (schema: ExportsJsonSchema): boolean => schema["type"] === "null" && Object.keys(schema).length === 1;
    const isConst = (schema: ExportsJsonSchema): boolean => "const" in schema && Object.keys(schema).length === 1;
    if (schemas.every((schema) => isConst(schema) || isNull(schema))) {
      return { enum: schemas.map((schema) => (isNull(schema) ? null : schema["const"])) };
    }
    return { anyOf: schemas };
  }

  function objectSchema(type: TS.Type, output: boolean): ExportsJsonSchema {
    if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) {
      throw new NotJson(checker.typeToString(type), true);
    }
    const symbol = type.getSymbol() ?? type.aliasSymbol;
    if (symbol && NOT_JSON_GLOBALS.has(symbol.name) && isGlobal(symbol)) throw new NotJson(symbol.name, false);
    if (checker.isTupleType(type)) {
      const reference = type as TS.TupleTypeReference;
      const elements = checker.getTypeArguments(reference).map((element) => schemaOf(element, output));
      const fixed = reference.target.fixedLength;
      return { type: "array", prefixItems: elements, minItems: reference.target.minLength, ...(reference.target.hasRestElement ? {} : { maxItems: fixed }) };
    }
    if (checker.isArrayType(type)) {
      const [element] = checker.getTypeArguments(type as TS.TypeReference);
      return { type: "array", items: element ? schemaOf(element, output) : {} };
    }
    if (symbol && symbol.flags & ts.SymbolFlags.Class) throw new NotJson(`an instance of the class ${symbol.name}`, false);

    // A named type goes into $defs one time, and a reference stands for it. This also ends a cycle.
    const named = definitionName(type);
    if (named !== undefined) {
      const existing = defNames.get(type);
      if (existing !== undefined) return { $ref: `#/$defs/${existing}` };
      const key = uniqueName(named);
      defNames.set(type, key);
      defs.set(key, {});
      try {
        defs.set(key, plainObjectSchema(type));
      } catch (error) {
        defs.delete(key);
        defNames.delete(type);
        throw error;
      }
      return { $ref: `#/$defs/${key}` };
    }
    return plainObjectSchema(type);
  }

  function plainObjectSchema(type: TS.Type): ExportsJsonSchema {
    const properties: Record<string, ExportsJsonSchema> = {};
    const required: string[] = [];
    for (const property of checker.getPropertiesOfType(type)) {
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      if (declaration && (ts.isMethodSignature(declaration) || ts.isMethodDeclaration(declaration))) {
        throw new NotJson(`an object with the method ${property.name}`, false);
      }
      if (property.name.startsWith("__@")) throw new NotJson(`an object with a symbol key`, false);
      const propertyType = checker.getTypeOfSymbol(property);
      let schema: ExportsJsonSchema;
      try {
        // A property has the same schema in an input and in an output, so a definition serves both
        schema = schemaOf(propertyType, false);
      } catch (error) {
        throw error instanceof NotJson ? error.inside(property.name) : error;
      }
      const description = firstParagraph(text(property.getDocumentationComment(checker)));
      properties[property.name] = description ? { ...schema, description } : schema;
      // JSON has no undefined: a property with an undefined member can be absent
      const optional = (property.flags & ts.SymbolFlags.Optional) !== 0 || hasUndefinedMember(propertyType);
      if (!optional) required.push(property.name);
    }
    const schema: Record<string, unknown> = { type: "object", properties };
    if (required.length) schema["required"] = required;
    const stringIndex = checker.getIndexInfoOfType(type, ts.IndexKind.String);
    if (stringIndex) schema["additionalProperties"] = schemaOf(stringIndex.type, false);
    return schema;
  }

  // A bare undefined does not get here: schemaOf refuses it in a property
  function hasUndefinedMember(type: TS.Type): boolean {
    return type.isUnion() && type.types.some((member) => (member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0);
  }

  function definitionName(type: TS.Type): string | undefined {
    // A type of the standard library, for example Readonly<Record<string, number>>, stays inline
    const alias = type.aliasSymbol && !isGlobal(type.aliasSymbol) ? type.aliasSymbol : undefined;
    const symbol = alias ?? type.getSymbol();
    if (!symbol || symbol.name === "__type" || symbol.name === "__object" || isGlobal(symbol)) return undefined;
    if (!(symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias))) return undefined;
    // An instance of a generic type gets the text of its arguments, for example Confusion_string
    return checker.typeToString(type).replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function uniqueName(name: string): string {
    if (!defs.has(name)) return name;
    let index = 2;
    while (defs.has(`${name}_${index}`)) index++;
    return `${name}_${index}`;
  }

  function isGlobal(symbol: TS.Symbol): boolean {
    return (symbol.declarations ?? []).some((declaration) => declaration.getSourceFile().hasNoDefaultLib || program.isSourceFileDefaultLibrary(declaration.getSourceFile()));
  }

  function text(parts: readonly TS.SymbolDisplayPart[]): string {
    return ts.displayPartsToString([...parts]).trim();
  }
}

/** The first paragraph of a doc comment, on one line. */
function firstParagraph(comment: string): string {
  const [first = ""] = comment.split(/\n\s*\n/);
  return first.replace(/\s+/g, " ").trim();
}

/** A comparison of two names by code unit, the same on each platform. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
