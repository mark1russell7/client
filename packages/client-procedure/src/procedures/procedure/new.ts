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
 * - the registration goes into src/register.ts.
 * A name whose path, file, types or registration exists already is an error, and nothing is
 * written. Before, "a.b.c" and "a.c" wrote the same file, and existing types were reused silently.
 */

import { join } from "node:path";
import { PROCEDURE_REGISTRY, type ProcedureContext } from "@mark1russell7/client";
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

export interface ${pascalName}Output {
  /** Whether the operation succeeded */
  success: boolean;
  /** Response message */
  message: string;
}
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
    const presentNames = new Set(present.map((part) => part.replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim()));
    const missing = names.filter((name) => !presentNames.has(name));
    if (missing.length === 0) {
      return source;
    }
    const replacement = `import { ${[...present, ...missing].join(", ")} } from "${moduleName}";`;
    return source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length);
  }
  return addImports(source, [`import { ${names.join(", ")} } from "${moduleName}";\n`]);
}

/** The index of the bracket that closes the bracket at `open` (strings are skipped) */
function closingBracket(source: string, open: number): number {
  let depth = 0;
  let quote: string | undefined;
  for (let i = open; i < source.length; i++) {
    const ch = source[i]!;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) return i;
  }
  return -1;
}

/**
 * Add an item to the array of the first registerProcedures([...]) or registerAll([...]) call.
 * Returns undefined when the source has no such call.
 */
export function addToRegistration(source: string, item: string): string | undefined {
  // The first call in code, not in a comment
  const call = [...source.matchAll(/\b(registerProcedures|registerAll)\s*\(/g)].find((match) => {
    const lineStart = source.lastIndexOf("\n", match.index) + 1;
    const before = source.slice(lineStart, match.index).trim();
    return !before.startsWith("*") && !before.startsWith("/*") && !before.includes("//");
  });
  if (!call) {
    return undefined;
  }
  const open = source.indexOf("[", call.index);
  const close = open === -1 ? -1 : closingBracket(source, open);
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
 * The procedure definition that goes into register.ts
 */
function generateRegistration(layout: ProcedureLayout, description: string): string {
  const { segments, camelName, pascalName } = layout;
  return `const ${camelName}Procedure = createProcedure()
  .path(${JSON.stringify(segments)})
  .input(zodAdapter<${pascalName}Input>(${pascalName}InputSchema))
  .output(outputSchema<${pascalName}Output>())
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

import { registerProcedures } from "@mark1russell7/client";

export function register(): void {
  registerProcedures([]);
}

// Auto-register
register();
`;

/**
 * Put the procedure into register.ts: its imports, its definition, and its place in the
 * registration array. Returns undefined when register.ts has no registration call.
 */
export function registerSource(source: string, layout: ProcedureLayout, description: string, importPath: string): string | undefined {
  const { camelName, pascalName } = layout;
  const withArray = addToRegistration(source, `${camelName}Procedure`);
  if (withArray === undefined) {
    return undefined;
  }
  let updated = ensureNamedImports(withArray, "@mark1russell7/client", ["createProcedure", "zodAdapter", "outputSchema"]);
  updated = addImports(updated, [
    `import { ${camelName} } from "${importPath}";\n`,
    `import { ${pascalName}InputSchema, type ${pascalName}Input, type ${pascalName}Output } from "./types.js";\n`,
  ]);
  // The definition goes before the code that registers the procedures
  const anchor = /^(export\s+)?(async\s+)?function\s+register\w*\s*\(|^\s*(registerProcedures|PROCEDURE_REGISTRY\.registerAll)\s*\(/m.exec(updated);
  const at = anchor ? anchor.index : updated.length;
  return updated.slice(0, at) + generateRegistration(layout, description) + updated.slice(at);
}

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
  const registerFile = join(srcPath, "register.ts");
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
  if (PROCEDURE_REGISTRY.has(segments)) {
    return fail(`A procedure is registered at ${segments.join(".")} already. Choose another name.`);
  }
  if (await pathExists(procedureFile, ctx)) {
    return fail(`Procedure file already exists: ${procedureFile}`);
  }
  const existingTypes = await readText(typesFile, ctx);
  if (existingTypes !== undefined && new RegExp(`\\b${pascalName}(Input|Output|InputSchema)\\b`).test(existingTypes)) {
    return fail(
      `types.ts already has types named ${pascalName}: the name ${segments.join(".")} collides with another procedure. Choose another name.`
    );
  }
  const existingRegister = await readText(registerFile, ctx);
  if (existingRegister !== undefined) {
    if (existingRegister.includes(JSON.stringify(segments)) || new RegExp(`\\b${camelName}Procedure\\b`).test(existingRegister)) {
      return fail(`register.ts already registers ${segments.join(".")} (or ${camelName}Procedure). Choose another name.`);
    }
  }
  const registerBase = existingRegister ?? REGISTER_TEMPLATE;
  const newRegister = registerSource(registerBase, layout, description, importPath);

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
        ...(existingRegister !== undefined && newRegister !== undefined ? [registerFile] : []),
      ],
      operations: [
        `Would create procedure file: ${procedureFile}`,
        `Would create/update index: ${namespaceIndex}`,
        existingTypes === undefined ? `Would create ${typesFile}` : `Would append types to: ${typesFile}`,
        newRegister === undefined
          ? `Would not change ${registerFile}: it has no registerProcedures([...]) call`
          : `Would register the procedure in: ${registerFile}`,
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
    if (newRegister === undefined) {
      operations.push(
        `register.ts has no registerProcedures([...]) call: add ${camelName}Procedure to the registration of ${registerFile}`
      );
    } else {
      operations.push(`${existingRegister === undefined ? "Creating" : "Updating"} registration: ${registerFile}`);
      await writeText(registerFile, newRegister, ctx);
      (existingRegister === undefined ? created : modified).push(registerFile);
      if (existingRegister === undefined) {
        operations.push(`Import ./register.js from src/index.ts, so importing the package registers its procedures`);
      }
    }

    operations.push(`Next: implement ${segments.join(".")} in ${procedureFile}, then run pnpm build`);

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
