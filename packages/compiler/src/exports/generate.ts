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
  CONSTRUCT_KEYWORD,
  EXPORTS_MANIFEST_FORMAT,
  PROGRAM_KEYWORD,
  type ExportExemption,
  type ExportProcedure,
  type ExportsConstruct,
  type ExportsJsonSchema,
  type ExportsManifest,
  type ExportsProgram,
} from "./types.js";

/** The data that a package adds to the generated manifest: the overlay. */
export interface ExportsOverlay {
  /** The effects of each procedure. Absent: unknown. A package of pure functions gives `{ reads: [], writes: [] }`. */
  readonly effects?: Effects;
  /** The changes for single functions, by the name of the export. */
  readonly functions?: Readonly<Record<string, ExportsFunctionOverlay>>;
  /**
   * The function that makes a constructed input, by the name of its type, for example
   * `{ "Random": "random" }`. It is necessary only when more than one pure function gives the type.
   */
  readonly constructors?: Readonly<Record<string, string>>;
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

/** A pure function of the package that gives a type that is not JSON: it makes a constructed input. */
interface Factory {
  readonly name: string;
  readonly signature: TS.Signature;
}

/** The JSON input of a factory: the schema of a constructed input, and the call that makes the value. */
interface FactoryInput {
  readonly schema: ExportsJsonSchema;
  readonly construct: ExportsConstruct;
}

/** The deepest schema that the generator makes. A deeper type fails closed. */
const MAX_DEPTH = 64;

/**
 * The schema of each JSON value but null. In TypeScript, the type `{}` takes each value but null and
 * undefined, and `NonNullable<T>` is `T & {}`. The schema lists the types, because zod cannot read `not`.
 */
const NOT_NULL: ExportsJsonSchema = { type: ["boolean", "number", "string", "array", "object"] };

/** The names of the global object types that have no JSON form. */
const NOT_JSON_GLOBALS = new Set([
  "Date", "Map", "Set", "ReadonlyMap", "ReadonlySet", "WeakMap", "WeakSet", "WeakRef", "RegExp", "Promise", "Error",
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
  // Node.js resolves the imports of a package from its real path, not from a link to it: a link of
  // pnpm in node_modules has no sibling packages. So the program reads the real path.
  const absolute = ts.sys.resolvePath(options.declarations);
  const resolved = (ts.sys.realpath?.(absolute) ?? absolute).split("\\").join("/");
  // The folder of the declarations is the current folder, so the type roots are the folders above it
  const host = ts.createCompilerHost(compilerOptions, true);
  const folder = resolved.slice(0, resolved.lastIndexOf("/"));
  host.getCurrentDirectory = () => folder;
  const program = ts.createProgram({ rootNames: [resolved], options: compilerOptions, host });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(resolved);
  if (!source) throw new Error(`The declaration file ${options.declarations} is not readable`);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) throw new Error(`The declaration file ${options.declarations} is not a module`);

  const defs = new Map<string, ExportsJsonSchema>();
  const defNames = new Map<TS.Type, string>();
  let depth = 0;
  const procedures: ExportProcedure[] = [];
  const exempt: ExportExemption[] = [];
  const classes: string[] = [];
  let values = 0;
  let types = 0;
  const overlay = options.overlay ?? {};

  const exports = [...checker.getExportsOfModule(moduleSymbol)].sort((a, b) => compare(a.name, b.name));
  const factories = factoriesOf(exports);
  // A factory whose input reaches its own type has no input: null
  const factoryInputs = new Map<Factory, FactoryInput | null>();
  for (const exported of exports) {
    const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const name = exported.name;
    // A re-export whose module does not resolve has no declaration. It fails closed, as a function
    if (exported.flags & ts.SymbolFlags.Alias && !symbol.declarations?.length) {
      exempt.push({ name, reason: "unresolved", detail: "the export does not resolve, for example its module is not installed" });
      continue;
    }
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
        // A value that is not JSON can come from a pure function of the package: a constructed input
        const constructed = error.isFunction ? undefined : constructedSchema(parameterType);
        if (constructed === undefined || "problem" in constructed) {
          const problem = constructed !== undefined ? `. ${constructed.problem}` : "";
          return {
            name,
            reason: error.isFunction ? "function-parameter" : "input-not-json",
            detail: `${error.detail(parameterName)}${problem}`,
          };
        }
        schema = constructed;
      }
      const own = parameterText(parameter);
      const description = own && CONSTRUCT_KEYWORD in schema ? `${own} ${String(schema["description"])}` : own;
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
    // A named type serves inputs and outputs, so a function in it can reach an output as a sub-program
    const programAt = programPath(output);
    if (programAt !== undefined) return { name, reason: "output-not-json", detail: programAt ? `${programAt}: a function` : "a function" };

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
   * The factories of the package, by the type that they give. A factory is a public function with
   * one signature and no type parameter. Its effects are pure, and it gives an object at once.
   */
  function factoriesOf(all: readonly TS.Symbol[]): Map<TS.Type, Factory[]> {
    const found = new Map<TS.Type, Factory[]>();
    for (const exported of all) {
      const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      if (!symbol.declarations?.length || !(symbol.flags & (ts.SymbolFlags.Function | ts.SymbolFlags.Variable))) continue;
      const signatures = checker.getTypeOfSymbolAtLocation(symbol, source!).getCallSignatures();
      if (signatures.length !== 1 || signatures[0]!.getTypeParameters()?.length) continue;
      if (!isPure(overlay.functions?.[exported.name]?.effects ?? overlay.effects)) continue;
      const made = signatures[0]!.getReturnType();
      if (!(made.flags & ts.TypeFlags.Object) || promisedType(made) !== undefined) continue;
      found.set(made, [...(found.get(made) ?? []), { name: exported.name, signature: signatures[0]! }]);
    }
    return found;
  }

  /**
   * The schema of a constructed input: the JSON input of the one factory that gives the type of the
   * parameter. The result is undefined when no factory gives the type. It is a problem when more
   * than one factory gives it and the overlay does not name one.
   */
  function constructedSchema(type: TS.Type): ExportsJsonSchema | { readonly problem: string } | undefined {
    // An optional parameter has the type `T | undefined`
    const defined = type.isUnion() ? type.types.filter((member) => !(member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void))) : [type];
    if (defined.length !== 1) return undefined;
    const made = defined[0]!;
    const candidates = (factories.get(made) ?? []).filter((factory) => factoryInput(factory) !== undefined);
    if (candidates.length === 0) return undefined;
    const typeName = checker.typeToString(made);
    const named = overlay.constructors?.[typeName];
    const factory = named === undefined ? (candidates.length === 1 ? candidates[0] : undefined) : candidates.find((candidate) => candidate.name === named);
    if (factory === undefined) {
      return {
        problem:
          named === undefined
            ? `The functions ${candidates.map((candidate) => candidate.name).join(", ")} give ${typeName}: overlay.constructors names one`
            : `overlay.constructors names ${named} for ${typeName}, but ${named} is not a pure function that gives it from JSON`,
      };
    }
    const { schema, construct } = factoryInput(factory)!;
    const call = `${factory.name}(${construct.params.join(", ")})`;
    return { ...schema, description: `The input of ${factory.name}: the procedure makes the ${typeName} with ${call} before the call.`, [CONSTRUCT_KEYWORD]: construct };
  }

  /**
   * The JSON input of a factory: its parameters up to the first optional parameter that is not JSON.
   * The result is undefined when a parameter that is not optional is not JSON.
   */
  function factoryInput(factory: Factory): FactoryInput | undefined {
    if (factoryInputs.has(factory)) return factoryInputs.get(factory) ?? undefined;
    factoryInputs.set(factory, null);
    const params: string[] = [];
    const properties: Record<string, ExportsJsonSchema> = {};
    const required: string[] = [];
    for (const [index, parameter] of factory.signature.getParameters().entries()) {
      const declaration = parameter.valueDeclaration;
      if (!declaration || !ts.isParameter(declaration)) return undefined;
      // A rest parameter is optional, and a constructed input has no spread
      if (declaration.dotDotDotToken) break;
      const optional = checker.isOptionalParameter(declaration);
      let schema: ExportsJsonSchema;
      try {
        schema = schemaOf(checker.getTypeOfSymbolAtLocation(parameter, declaration), false);
      } catch (error) {
        if (!(error instanceof NotJson)) throw error;
        if (optional) break;
        return undefined;
      }
      const parameterName = ts.isIdentifier(declaration.name) ? declaration.name.text : `arg${index}`;
      const description = parameterText(parameter);
      properties[parameterName] = description ? { ...schema, description } : schema;
      params.push(parameterName);
      if (!optional) required.push(parameterName);
    }
    const input: FactoryInput = {
      schema: { type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false },
      construct: { function: factory.name, params },
    };
    factoryInputs.set(factory, input);
    return input;
  }

  /**
   * The schema of a type. `output` is true for the output and its items: there an `undefined`
   * member gives `null`, as in JSON. A property with an `undefined` member is optional.
   */
  function schemaOf(type: TS.Type, output: boolean): ExportsJsonSchema {
    // A generic type can grow at each level, for example Nest<Nest<T>>: such a type fails closed
    if (depth >= MAX_DEPTH) throw new NotJson(`a type deeper than ${MAX_DEPTH} levels`, false);
    depth++;
    try {
      return typeSchema(type, output);
    } finally {
      depth--;
    }
  }

  function typeSchema(type: TS.Type, output: boolean): ExportsJsonSchema {
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
    if (type.isIntersection()) {
      // A {} in an intersection only takes out null and undefined: NonNullable<T> is T & {}
      const members = type.types.filter((member) => !isEmptyObject(member));
      const [member] = members;
      if (member !== undefined && members.length === 1 && members.length < type.types.length) return withoutNull(schemaOf(member, output));
    }
    if (type.isIntersection() || flags & ts.TypeFlags.Object) return objectSchema(type, output);
    throw new NotJson(checker.typeToString(type), false);
  }

  function unionSchema(type: TS.UnionType, output: boolean): ExportsJsonSchema {
    // A named union goes into $defs as a named object does. This also ends a cycle through it.
    const named = definitionName(type);
    if (named === undefined) return membersSchema(type.types, output);
    // The definition serves inputs and outputs, so it has no undefined member: an output adds null
    const defined = type.types.filter((member) => !(member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)));
    const reference = definition(type, named, () => membersSchema(defined, false));
    return output && defined.length < type.types.length ? { anyOf: [reference, { type: "null" }] } : reference;
  }

  function membersSchema(all: readonly TS.Type[], output: boolean): ExportsJsonSchema {
    let members = all;
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
      if (!output) return programSchema(type);
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
    if (isEmptyObject(type)) return NOT_NULL;

    // A named type goes into $defs one time, and a reference stands for it. This also ends a cycle.
    const named = definitionName(type);
    return named !== undefined ? definition(type, named, () => plainObjectSchema(type)) : plainObjectSchema(type);
  }

  /** True for the type `{}`: an object type with no property, no signature and no index. */
  function isEmptyObject(type: TS.Type): boolean {
    return (
      (type.flags & ts.TypeFlags.Object) !== 0 &&
      checker.getPropertiesOfType(type).length === 0 &&
      type.getCallSignatures().length === 0 &&
      type.getConstructSignatures().length === 0 &&
      checker.getIndexInfosOfType(type).length === 0 &&
      !checker.isArrayType(type) &&
      !checker.isTupleType(type)
    );
  }

  /** The schema without null: the schema of `NonNullable` of a type. */
  function withoutNull(schema: ExportsJsonSchema): ExportsJsonSchema {
    if (Object.keys(schema).length === 0) return NOT_NULL;
    const members = schema["anyOf"];
    if (!Array.isArray(members)) return schema;
    const kept = members.filter((member: ExportsJsonSchema) => !(Object.keys(member).length === 1 && member["type"] === "null"));
    return kept.length === 1 ? (kept[0] as ExportsJsonSchema) : { ...schema, anyOf: kept };
  }

  /** A reference to the definition of a named type. The first reference builds the definition. */
  function definition(type: TS.Type, named: string, build: () => ExportsJsonSchema): ExportsJsonSchema {
    const existing = defNames.get(type);
    if (existing !== undefined) return { $ref: `#/$defs/${existing}` };
    const key = uniqueName(named);
    defNames.set(type, key);
    defs.set(key, {});
    try {
      defs.set(key, build());
    } catch (error) {
      defs.delete(key);
      defNames.delete(type);
      throw error;
    }
    return { $ref: `#/$defs/${key}` };
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

  /**
   * The schema of a function in an input: a sub-program, one call of a pure procedure as data
   * (d40-language-ops). The function has one signature with no type parameter and no rest
   * parameter. Its parameters and its result are JSON, and its result is not a promise.
   */
  function programSchema(type: TS.Type): ExportsJsonSchema {
    const what = checker.typeToString(type);
    const signatures = type.getCallSignatures();
    const signature = signatures[0];
    if (
      signature === undefined ||
      signatures.length > 1 ||
      type.getConstructSignatures().length > 0 ||
      checker.getPropertiesOfType(type).length > 0 ||
      (signature.getTypeParameters()?.length ?? 0) > 0
    ) {
      throw new NotJson(what, true);
    }
    try {
      const params: string[] = [];
      const inputs: ExportsJsonSchema[] = [];
      for (const [index, parameter] of signature.getParameters().entries()) {
        const declaration = parameter.valueDeclaration;
        if (!declaration || !ts.isParameter(declaration) || declaration.dotDotDotToken) throw new NotJson(what, true);
        params.push(ts.isIdentifier(declaration.name) ? declaration.name.text : `arg${index}`);
        // The package gives these values to the function, as it gives an output
        inputs.push(schemaOf(checker.getTypeOfSymbolAtLocation(parameter, declaration), true));
      }
      const result = signature.getReturnType();
      if (promisedType(result) || result.flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined)) throw new NotJson(what, true);
      // The function gives this value to the package, as an input does
      const resultSchema = schemaOf(result, false);
      // A sub-program gives JSON, so it cannot give a function to the package
      if (programPath(resultSchema) !== undefined) throw new NotJson(what, true);
      const hasNull = result.isUnion() && result.types.some((member) => (member.flags & ts.TypeFlags.Null) !== 0);
      const program: ExportsProgram = {
        params,
        inputs,
        output: resultSchema,
        ...(hasUndefinedMember(result) && !hasNull ? { undefinedForNull: true as const } : {}),
      };
      const reads = params.length ? ` It reads each parameter as {"$ref": "<name>"}: ${params.join(", ")}.` : "";
      return {
        type: "object",
        description: `One call of a pure procedure, as data, for the function ${what}.${reads}`,
        required: ["$proc"],
        properties: {
          $proc: { type: "array", items: { type: "string" }, minItems: 1 },
          input: {},
          $when: { const: "$never" },
        },
        [PROGRAM_KEYWORD]: program,
      };
    } catch (error) {
      throw error instanceof NotJson ? new NotJson(what, true) : error;
    }
  }

  /**
   * This function gives the path from a schema to its first sub-program, through the definitions.
   * The path of the schema itself is `""`. The result is `undefined` when the schema has no sub-program.
   */
  function programPath(schema: ExportsJsonSchema): string | undefined {
    const seen = new Set<string>();
    const visit = (node: unknown, path: readonly string[]): string | undefined => {
      if (node === null || typeof node !== "object") return undefined;
      if (Array.isArray(node)) {
        for (const item of node) {
          const found = visit(item, path);
          if (found !== undefined) return found;
        }
        return undefined;
      }
      const record = node as Record<string, unknown>;
      // path-check: a position in the input schema, the property names, not a procedure path
      if (PROGRAM_KEYWORD in record) return path.join(".");
      const ref = record["$ref"];
      if (typeof ref === "string" && ref.startsWith("#/$defs/")) {
        const key = ref.slice("#/$defs/".length);
        if (seen.has(key)) return undefined;
        seen.add(key);
        return visit(defs.get(key), path);
      }
      const properties = record["properties"];
      if (properties !== null && typeof properties === "object") {
        for (const [key, value] of Object.entries(properties)) {
          const found = visit(value, [...path, key]);
          if (found !== undefined) return found;
        }
      }
      for (const key of ["items", "prefixItems", "additionalProperties", "anyOf"]) {
        const found = visit(record[key], path);
        if (found !== undefined) return found;
      }
      return undefined;
    };
    return visit(schema, []);
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

  /** The doc of a parameter, without the hyphen of TSDoc: `@param name - text` gives `text`. */
  function parameterText(parameter: TS.Symbol): string {
    return text(parameter.getDocumentationComment(checker)).replace(/^-\s+/, "");
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

/** True when the effects read nothing and change nothing. */
function isPure(effects: Effects | undefined): boolean {
  return effects?.reads !== undefined && effects.reads.length === 0 && effects.writes !== undefined && effects.writes.length === 0;
}
