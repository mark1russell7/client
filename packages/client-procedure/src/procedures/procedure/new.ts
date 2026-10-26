/**
 * procedure.new - Scaffold a new procedure
 *
 * Creates the procedure file, its types and its registration. A dot-notation name such as
 * "user.create" makes the procedure at ["user", "create"]: the file is
 * procedures/user/create.ts, and "api.v2.users.create" gives procedures/api/v2/users/create.ts.
 *
 * The scaffolded code compiles with the strict options of the workspace (deep dive CLI-13):
 * - the handler names its unused input `_input` (noUnusedParameters);
 * - types.ts is created, or gets `import { z } from "zod"`, when it needs it;
 * - the registration goes into the list that defineModule gets in src/module.ts: an array literal,
 *   or the array of a variable that module.ts declares. A package of the old kind, without
 *   module.ts, gets it in the registerProcedures([...]) array of src/register.ts.
 * A name whose path, file, types or registration exists already is an error, and nothing is
 * written. Before, "a.b.c" and "a.c" wrote the same file, and existing types were reused silently.
 * A module whose list procedure.new cannot find is an error too, and nothing is written.
 */

import { join } from "node:path";
import { PROCEDURE_REGISTRY, type ProcedureContext } from "@procedures/client";
import type { ProcedureNewInput, ProcedureNewOutput } from "../../types.js";

interface FsExistsOutput { exists: boolean; path: string; }
interface FsReadOutput { path: string; content: string; }
interface FsWriteOutput { path: string; bytesWritten: number; }
interface FsMkdirOutput { path: string; created: boolean; }

/**
 * Check if path exists
 */
async function pathExists(pathStr: string, ctx: ProcedureContext): Promise<boolean> {
  try {
    const result = await ctx.client.call<{ path: string }, FsExistsOutput>(
      ["fs", "exists"],
      { path: pathStr }
    );
    return result.exists;
  } catch {
    return false;
  }
}

async function readText(pathStr: string, ctx: ProcedureContext): Promise<string | undefined> {
  if (!(await pathExists(pathStr, ctx))) {
    return undefined;
  }
  const result = await ctx.client.call<{ path: string }, FsReadOutput>(["fs", "read"], { path: pathStr });
  return result.content;
}

async function writeText(pathStr: string, content: string, ctx: ProcedureContext): Promise<void> {
  await ctx.client.call<{ path: string; content: string }, FsWriteOutput>(["fs", "write"], { path: pathStr, content });
}

/**
 * Convert camelCase to PascalCase
 */
function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert dot.notation to camelCase
 */
function toCamelCase(segments: string[]): string {
  return segments
    .map((s, i) => (i === 0 ? s : toPascalCase(s)))
    .join("");
}

/** The names and files of one procedure */
export interface ProcedureLayout {
  segments: string[];
  namespace: string;
  /** The folders under procedures/<namespace>/ */
  folders: string[];
  /** The file name without ".ts" */
  fileBase: string;
  camelName: string;
  pascalName: string;
}

/**
 * The layout of a procedure: procedures/<namespace>/<middle segments>/<last segment>.ts
 */
export function procedureLayout(name: string, namespace?: string): ProcedureLayout {
  const segments = name.split(".");
  return {
    segments,
    namespace: namespace ?? segments[0]!,
    folders: segments.length > 2 ? segments.slice(1, -1) : [],
    fileBase: segments[segments.length - 1]!,
    camelName: toCamelCase(segments),
    pascalName: segments.map(toPascalCase).join(""),
  };
}

/**
 * Generate procedure file content
 */
function generateProcedureFile(layout: ProcedureLayout, description: string): string {
  const { segments, camelName, pascalName, folders } = layout;
  // procedures/<namespace>/<folders...>/<file>.ts -> src/types.ts
  const typesPath = `${"../".repeat(2 + folders.length)}types.js`;

  return `/**
 * ${segments.join(".")} procedure
 *
 * ${description}
 */

import type { ${pascalName}Input, ${pascalName}Output } from "${typesPath}";

/**
 * ${description}
 */
export async function ${camelName}(_input: ${pascalName}Input): Promise<${pascalName}Output> {
  // TODO: Implement ${segments.join(".")} (rename _input to input when the code uses it)
  return {
    success: true,
    message: "Hello from ${segments.join(".")}",
  };
}
`;
}

/**
 * Generate type definitions
 */
function generateTypes(layout: ProcedureLayout, description: string): string {
  const { segments, pascalName } = layout;
  const schemaName = `${pascalName}InputSchema`;
  const outputSchemaName = `${pascalName}OutputSchema`;

  // The output has a real schema too: the registry validates each result with it. (Before, the
  // output was an interface with a pass-through outputSchema(), so no result was checked.)
  return `
// =============================================================================
// ${segments.join(".")} Types - ${description}
// =============================================================================

export const ${schemaName}: z.ZodObject<{
  // TODO: Add input fields
}> = z.object({
  // TODO: Add input fields
});

export type ${pascalName}Input = z.infer<typeof ${schemaName}>;

export const ${outputSchemaName}: z.ZodObject<{
  success: z.ZodBoolean;
  message: z.ZodString;
}> = z.object({
  /** Whether the operation succeeded */
  success: z.boolean().describe("Whether the operation succeeded"),
  /** Response message */
  message: z.string().describe("Response message"),
});

export type ${pascalName}Output = z.infer<typeof ${outputSchemaName}>;
`;
}

const TYPES_HEADER = `/**
 * Type definitions of the procedures of this package
 */

`;

const Z_IMPORT = `import { z } from "zod";\n`;

/** True when the source imports z from "zod" */
function importsZ(source: string): boolean {
  return (
    /import\s*\{[^}]*\bz\b[^}]*\}\s*from\s*["']zod["']/.test(source) ||
    /import\s+\*\s+as\s+z\s+from\s*["']zod["']/.test(source) ||
    /import\s+z\s+from\s*["']zod["']/.test(source)
  );
}

/**
 * Add import lines after the last import of a source (or after its leading comment)
 */
export function addImports(source: string, lines: string[]): string {
  if (lines.length === 0) {
    return source;
  }
  const block = lines.join("");
  const importPattern = /^import[\s\S]*?from\s*["'][^"']+["'];?[ \t]*\r?\n|^import\s*["'][^"']+["'];?[ \t]*\r?\n/gm;
  let end = -1;
  for (const match of source.matchAll(importPattern)) {
    end = match.index + match[0].length;
  }
  if (end === -1) {
    const comment = /^\s*\/\*[\s\S]*?\*\/[ \t]*\r?\n(\r?\n)?/.exec(source);
    end = comment ? comment[0].length : 0;
  }
  return source.slice(0, end) + block + source.slice(end);
}

/**
 * Add names to the value import from a module, or add the import
 */
export function ensureNamedImports(source: string, moduleName: string, names: string[]): string {
  const escaped = moduleName.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&");
  const pattern = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${escaped}["'];?`);
  const match = pattern.exec(source);
  if (match && !/^import\s+type\b/.test(match[0])) {
    const present = match[1]!
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    // The imported name is the first word of a part: "a", "type a" or "a as b" import "a"
    const presentNames = new Set(present.map((part) => part.replace(/^type\s+/, "").split(/\s/, 1)[0]!));
    const missing = names.filter((name) => !presentNames.has(name));
    if (missing.length === 0) {
      return source;
    }
    const replacement = `import { ${[...present, ...missing].join(", ")} } from "${moduleName}";`;
    return source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length);
  }
  return addImports(source, [`import { ${names.join(", ")} } from "${moduleName}";\n`]);
}

/** The index after the string or comment that starts at `i`, or `i` when code starts there */
function skipNonCode(source: string, i: number): number {
  const ch = source[i];
  if (ch === "/" && source[i + 1] === "/") {
    const end = source.indexOf("\n", i);
    return end === -1 ? source.length : end;
  }
  if (ch === "/" && source[i + 1] === "*") {
    const end = source.indexOf("*/", i + 2);
    return end === -1 ? source.length : end + 2;
  }
  if (ch === '"' || ch === "'" || ch === "`") {
    for (let j = i + 1; j < source.length; j++) {
      if (source[j] === "\\") j++;
      else if (source[j] === ch) return j + 1;
    }
    return source.length;
  }
  return i;
}

/** For each character of the source: true when it is code, false in a string or a comment */
function codeMask(source: string): boolean[] {
  const mask = new Array<boolean>(source.length).fill(true);
  for (let i = 0; i < source.length; i++) {
    const skip = skipNonCode(source, i);
    if (skip !== i) {
      mask.fill(false, i, skip);
      i = skip - 1;
    }
  }
  return mask;
}

/** The index of the bracket that closes the bracket at `open` (strings and comments are skipped) */
function closingBracket(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const skip = skipNonCode(source, i);
    if (skip !== i) {
      i = skip - 1;
      continue;
    }
    const ch = source[i];
    if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) return i;
  }
  return -1;
}

/** The start and the end of one argument of a call, without the spaces and comments around it */
interface ArgumentRange {
  start: number;
  end: number;
}

/** The arguments of the call whose "(" is at `open`. Undefined when the call does not end. */
function callArguments(source: string, open: number): ArgumentRange[] | undefined {
  const args: ArgumentRange[] = [];
  let depth = 0;
  let first = -1;
  let last = -1;
  const push = (): void => {
    if (first !== -1) args.push({ start: first, end: last });
    first = -1;
    last = -1;
  };
  for (let i = open; i < source.length; i++) {
    const skip = skipNonCode(source, i);
    if (skip !== i) {
      // A string is a part of the argument. A comment is not.
      if (source[i] !== "/") {
        if (first === -1) first = i;
        last = skip;
      }
      i = skip - 1;
      continue;
    }
    const ch = source[i]!;
    if (/\s/.test(ch)) continue;
    if (ch === "(" || ch === "[" || ch === "{") {
      if (++depth === 1) continue;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      if (--depth === 0) {
        push();
        return args;
      }
    } else if (ch === "," && depth === 1) {
      push();
      continue;
    }
    if (first === -1) first = i;
    last = i + 1;
  }
  return undefined;
}

/**
 * The index of the line where the statement at `index` starts, above its leading comments: code
 * that goes there comes before the statement.
 */
function statementStart(source: string, index: number): number {
  let start = source.lastIndexOf("\n", index - 1) + 1;
  for (;;) {
    const before = source.slice(0, start).replace(/\s*$/, "");
    if (before.endsWith("*/")) {
      const comment = before.lastIndexOf("/*");
      if (comment === -1) return start;
      start = source.lastIndexOf("\n", comment - 1) + 1;
      continue;
    }
    const lineStart = before.lastIndexOf("\n") + 1;
    if (before.length > 0 && before.slice(lineStart).trimStart().startsWith("//")) {
      start = lineStart;
      continue;
    }
    return start;
  }
}

/** The declaration of `name` in code as an array literal: the start of the statement and the "[" */
function arrayDeclaration(source: string, name: string, mask: boolean[]): { statement: number; open: number } | undefined {
  const escaped = name.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\w$.])(?:const|let|var)\\s+${escaped}\\s*(?::[^=;]*)?=\\s*\\[`, "g");
  for (const match of source.matchAll(pattern)) {
    if (mask[match.index]) {
      return { statement: statementStart(source, match.index), open: match.index + match[0].length - 1 };
    }
  }
  return undefined;
}

/** The argument of each call that holds the procedures */
const LIST_ARGUMENT: Readonly<Record<string, number>> = { defineModule: 1, registerProcedures: 0, registerAll: 0 };

/** The source with the item in the list, and the place for the definition of the item */
export interface RegistrationEdit {
  source: string;
  /** The definition of the item goes before this index, so that the list can use it */
  before: number;
}

/** An argument as a short text for a message */
function shortText(text: string): string {
  const line = text.replace(/\s+/g, " ");
  return line.length > 60 ? `${line.slice(0, 57)}...` : line;
}

/**
 * Add an item to the list of procedures of the first defineModule("name", list),
 * registerProcedures(list) or registerAll(list) call. The list is an array literal, the variable of
 * an array that this file declares, or `[...variable]`. Gives the reason as an error when the
 * source has no such list. Before, the item went into the first array after the call, also when
 * that array was the argument of `registerModules` (the ics and geo packages).
 */
export function addToRegistration(source: string, item: string): RegistrationEdit | { error: string } {
  const mask = codeMask(source);
  // The first call in code, not in a comment or a string, and not the declaration of the function
  const call = [...source.matchAll(/\b(defineModule|registerProcedures|registerAll)\s*\(/g)].find(
    (match) => mask[match.index] && !/\bfunction\s*$/.test(source.slice(0, match.index))
  );
  if (!call) {
    return { error: "the file has no defineModule, registerProcedures or registerAll call" };
  }
  const fn = call[1]!;
  const args = callArguments(source, call.index + call[0].length - 1);
  const list = args?.[LIST_ARGUMENT[fn]!];
  if (!list) {
    return { error: `the ${fn} call has no list of procedures` };
  }
  const text = source.slice(list.start, list.end);

  // The definition goes before the code that registers the procedures: the module, the register
  // function or the call
  const anchor =
    /^export\s+const\s+\w+\s*(:\s*\w+\s*)?=\s*defineModule\s*\(|^(export\s+)?(async\s+)?function\s+register\w*\s*\(|^\s*(registerProcedures|PROCEDURE_REGISTRY\.registerAll)\s*\(/m.exec(
      source
    );
  const callStatement = anchor && anchor.index <= call.index ? anchor.index : statementStart(source, call.index);

  let target: { open: number; before: number } | undefined;
  if (text.startsWith("[") && closingBracket(source, list.start) === list.end - 1) {
    // [...variable]: the item goes into the array of the variable, when this file declares it
    const spread = /^\[\s*\.\.\.\s*([A-Za-z_$][\w$]*)\s*,?\s*\]$/.exec(text);
    const declared = spread ? arrayDeclaration(source, spread[1]!, mask) : undefined;
    target = declared ? { open: declared.open, before: declared.statement } : { open: list.start, before: callStatement };
  } else if (/^[A-Za-z_$][\w$]*$/.test(text)) {
    const declared = arrayDeclaration(source, text, mask);
    if (!declared) {
      return { error: `${fn} gets "${text}", and this file does not declare "${text}" as an array` };
    }
    target = { open: declared.open, before: declared.statement };
  } else {
    return { error: `${fn} gets "${shortText(text)}", which is not an array or a variable of this file` };
  }

  const updated = insertItem(source, target.open, item);
  if (updated === undefined) {
    return { error: `the list of ${fn} has no closing bracket` };
  }
  // The item goes after the place of the definition, so that index does not move
  return { source: updated, before: target.before };
}

/** Add an item to the array whose "[" is at `open`. Undefined when the array does not end. */
function insertItem(source: string, open: number, item: string): string | undefined {
  const close = closingBracket(source, open);
  if (close === -1) {
    return undefined;
  }
  const content = source.slice(open + 1, close);
  let updated: string;
  if (content.trim() === "") {
    updated = item;
  } else if (content.includes("\n")) {
    // One item per line: add a line with the indentation of the last item
    const trimmed = content.replace(/\s*$/, "");
    const lastLine = trimmed.slice(trimmed.lastIndexOf("\n") + 1);
    const indent = /^\s*/.exec(lastLine)?.[0] ?? "  ";
    const comma = trimmed.endsWith(",") ? "" : ",";
    updated = `${trimmed}${comma}\n${indent}${item},${content.slice(trimmed.length)}`;
  } else {
    updated = `${content.replace(/,?\s*$/, "")}, ${item}`;
  }
  return source.slice(0, open + 1) + updated + source.slice(close);
}

/**
 * The procedure definition that goes into module.ts (or register.ts)
 */
function generateRegistration(layout: ProcedureLayout, description: string): string {
  const { segments, camelName, pascalName } = layout;
  return `const ${camelName}Procedure = createProcedure()
  .path(${JSON.stringify(segments)})
  .input(${pascalName}InputSchema)
  .output(${pascalName}OutputSchema)
  .meta({
    description: ${JSON.stringify(description)},
    args: [],
    shorts: {},
    output: "text",
  })
  .handler(async (input: ${pascalName}Input): Promise<${pascalName}Output> => ${camelName}(input))
  .build();

`;
}

const REGISTER_TEMPLATE = `/**
 * Procedure registration of this package
 *
 * Scaffold a procedure with: mark procedure new <name> --path <this package>
 */

import { registerProcedures } from "@procedures/client";

export function register(): void {
  registerProcedures([]);
}

// Auto-register
register();
`;

/**
 * Put the procedure into module.ts (or register.ts): its imports, its definition, and its place
 * in the list of procedures of the module. Gives the reason as an error when the file has no such
 * list (see `addToRegistration`).
 */
export function registerSource(
  source: string,
  layout: ProcedureLayout,
  description: string,
  importPath: string
): string | { error: string } {
  const { camelName, pascalName } = layout;
  const edit = addToRegistration(source, `${camelName}Procedure`);
  if ("error" in edit) {
    return edit;
  }
  // The definition goes before the list that uses it, then the imports go after the last import
  const withDefinition =
    edit.source.slice(0, edit.before) + generateRegistration(layout, description) + edit.source.slice(edit.before);
  const updated = ensureNamedImports(withDefinition, "@procedures/client", ["createProcedure"]);
  return addImports(updated, [
    `import { ${camelName} } from "${importPath}";\n`,
    `import { ${pascalName}InputSchema, ${pascalName}OutputSchema, type ${pascalName}Input, type ${pascalName}Output } from "./types.js";\n`,
  ]);
}

/**
 * The step after the scaffold for the effects. A host with a capability refuses a procedure
 * without `metadata.effects`, and `lib audit` reports it.
 */
const EFFECTS_STEP ="Write metadata.effects: lib audit reports a procedure without them";

/**
 * Generate index.ts export
 */
function generateIndexExport(relativeFile: string, functionName: string): string {
  return `export { ${functionName} } from "./${relativeFile}.js";\n`;
}

/**
 * Scaffold a new procedure
 */
export async function procedureNew(input: ProcedureNewInput, ctx: ProcedureContext): Promise<ProcedureNewOutput> {
  const operations: string[] = [];
  const created: string[] = [];
  const modified: string[] = [];
  const errors: string[] = [];

  const layout = procedureLayout(input.name, input.namespace);
  const { segments, namespace, folders, fileBase, camelName, pascalName } = layout;

  // Resolve paths
  const projectPath = input.path ?? process.cwd();
  const srcPath = join(projectPath, "src");
  const namespacePath = join(srcPath, "procedures", namespace);
  const procedureDir = join(namespacePath, ...folders);
  const procedureFile = join(procedureDir, `${fileBase}.ts`);
  const namespaceIndex = join(namespacePath, "index.ts");
  const typesFile = join(srcPath, "types.ts");
  const moduleFile = join(srcPath, "module.ts");
  const relativeFile = [...folders, fileBase].join("/");
  const importPath = `./procedures/${namespace}/${relativeFile}.js`;

  const description = input.description ?? `${segments.join(".")} procedure`;
  const fail = (message: string): ProcedureNewOutput => ({
    success: false,
    procedurePath: segments,
    created,
    modified,
    operations,
    errors: [...errors, message],
  });

  // Check every collision before anything is written
  // The registry of the invocation (a host with its own registry), else the global one
  if ((ctx.registry ?? PROCEDURE_REGISTRY).has(segments)) {
    return fail(`A procedure is registered at ${segments.join(".")} already. Choose another name.`);
  }
  if (await pathExists(procedureFile, ctx)) {
    return fail(`Procedure file already exists: ${procedureFile}`);
  }
  const existingTypes = await readText(typesFile, ctx);
  if (existingTypes !== undefined && new RegExp(`\\b${pascalName}(Input|Output|InputSchema|OutputSchema)\\b`).test(existingTypes)) {
    return fail(
      `types.ts already has types named ${pascalName}: the name ${segments.join(".")} collides with another procedure. Choose another name.`
    );
  }
  // The procedures go into module.ts. A package of the old kind, without it, has them in register.ts.
  const existingModule = await readText(moduleFile, ctx);
  const registerFile = existingModule !== undefined ? moduleFile : join(srcPath, "register.ts");
  const registerName = existingModule !== undefined ? "module.ts" : "register.ts";
  const existingRegister = existingModule ?? (await readText(registerFile, ctx));
  if (existingRegister !== undefined) {
    if (existingRegister.includes(JSON.stringify(segments)) || new RegExp(`\\b${camelName}Procedure\\b`).test(existingRegister)) {
      return fail(`${registerName} already registers ${segments.join(".")} (or ${camelName}Procedure). Choose another name.`);
    }
  }
  const registerBase = existingRegister ?? REGISTER_TEMPLATE;
  const newRegister = registerSource(registerBase, layout, description, importPath);
  // Without the list of the module, the procedure would not be registered: write nothing
  if (typeof newRegister !== "string") {
    return fail(
      `${registerFile} has no list of procedures that procedure.new can change: ${newRegister.error}. ` +
        `Nothing was written. Give the module an array of procedures in ${registerName}, and start procedure.new again.`
    );
  }

  if (input.dryRun) {
    const [indexExists] = await Promise.all([pathExists(namespaceIndex, ctx)]);
    return {
      success: true,
      procedurePath: segments,
      created: [
        procedureFile,
        ...(indexExists ? [] : [namespaceIndex]),
        ...(existingTypes === undefined ? [typesFile] : []),
        ...(existingRegister === undefined ? [registerFile] : []),
      ],
      modified: [
        ...(indexExists ? [namespaceIndex] : []),
        ...(existingTypes !== undefined ? [typesFile] : []),
        ...(existingRegister !== undefined ? [registerFile] : []),
      ],
      operations: [
        `Would create procedure file: ${procedureFile}`,
        `Would create/update index: ${namespaceIndex}`,
        existingTypes === undefined ? `Would create ${typesFile}` : `Would append types to: ${typesFile}`,
        `Would register the procedure in: ${registerFile}`,
      ],
      errors: [],
    };
  }

  try {
    // Step 1: Create the folder and the procedure file
    if (!(await pathExists(procedureDir, ctx))) {
      operations.push(`Creating directory: ${procedureDir}`);
      await ctx.client.call<{ path: string; recursive?: boolean }, FsMkdirOutput>(
        ["fs", "mkdir"],
        { path: procedureDir, recursive: true }
      );
      created.push(procedureDir);
    }
    operations.push(`Creating procedure file: ${procedureFile}`);
    await writeText(procedureFile, generateProcedureFile(layout, description), ctx);
    created.push(procedureFile);

    // Step 2: Create/update namespace index.ts
    const indexExport = generateIndexExport(relativeFile, camelName);
    const existingIndex = await readText(namespaceIndex, ctx);
    if (existingIndex !== undefined) {
      if (!existingIndex.includes(`from "./${relativeFile}.js"`)) {
        operations.push(`Updating index: ${namespaceIndex}`);
        await writeText(namespaceIndex, existingIndex + indexExport, ctx);
        modified.push(namespaceIndex);
      }
    } else {
      operations.push(`Creating index: ${namespaceIndex}`);
      await writeText(namespaceIndex, indexExport, ctx);
      created.push(namespaceIndex);
    }

    // Step 3: Add the types (create types.ts, or add the z import that the types need)
    const newTypes = generateTypes(layout, description);
    if (existingTypes === undefined) {
      operations.push(`Creating types: ${typesFile}`);
      await writeText(typesFile, TYPES_HEADER + Z_IMPORT + newTypes, ctx);
      created.push(typesFile);
    } else {
      operations.push(`Appending types to: ${typesFile}`);
      const withImport = importsZ(existingTypes) ? existingTypes : addImports(existingTypes, [Z_IMPORT]);
      await writeText(typesFile, withImport + newTypes, ctx);
      modified.push(typesFile);
    }

    // Step 4: Register the procedure
    operations.push(`${existingRegister === undefined ? "Creating" : "Updating"} registration: ${registerFile}`);
    await writeText(registerFile, newRegister, ctx);
    (existingRegister === undefined ? created : modified).push(registerFile);
    if (existingRegister === undefined) {
      operations.push(`Export the procedures from src/index.ts, and give the package a "./register" entry (see lib new)`);
    }

    operations.push(`Next: implement ${segments.join(".")} in ${procedureFile}, then run pnpm build`);
    // The scaffold writes no effects on purpose: a default of "pure" can be false
    operations.push(EFFECTS_STEP);

    return {
      success: errors.length === 0,
      procedurePath: segments,
      created,
      modified,
      operations,
      errors,
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}
