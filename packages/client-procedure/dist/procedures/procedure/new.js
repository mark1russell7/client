/**
 * procedure.new - Scaffold a new procedure
 *
 * Creates the procedure file, types, and registration boilerplate.
 * Supports dot-notation names like "user.create" which creates a
 * procedure at ["user", "create"] in the user/ namespace folder.
 */
import { join } from "node:path";
/**
 * Check if path exists
 */
async function pathExists(pathStr, ctx) {
    try {
        const result = await ctx.client.call(["fs", "exists"], { path: pathStr });
        return result.exists;
    }
    catch {
        return false;
    }
}
/**
 * Convert camelCase to PascalCase
 */
function toPascalCase(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
/**
 * Convert dot.notation to camelCase
 */
function toCamelCase(segments) {
    return segments
        .map((s, i) => (i === 0 ? s : toPascalCase(s)))
        .join("");
}
/**
 * Generate procedure file content
 */
function generateProcedureFile(segments, description) {
    const camelName = toCamelCase(segments);
    const pascalName = segments.map(toPascalCase).join("");
    return `/**
 * ${segments.join(".")} procedure
 *
 * ${description}
 */

import type { ${pascalName}Input, ${pascalName}Output } from "../../types.js";

/**
 * ${description}
 */
export async function ${camelName}(input: ${pascalName}Input): Promise<${pascalName}Output> {
  // TODO: Implement ${segments.join(".")} procedure
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
function generateTypes(segments, description) {
    const pascalName = segments.map(toPascalCase).join("");
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
/**
 * Generate index.ts export
 */
function generateIndexExport(filename, functionName) {
    return `export { ${functionName} } from "./${filename}.js";\n`;
}
/**
 * Scaffold a new procedure
 */
export async function procedureNew(input, ctx) {
    const operations = [];
    const created = [];
    const modified = [];
    const errors = [];
    // Parse the procedure name into segments
    const segments = input.name.split(".");
    const namespace = input.namespace ?? segments[0];
    const procedureName = segments[segments.length - 1];
    const camelName = toCamelCase(segments);
    const pascalName = segments.map(toPascalCase).join("");
    // Resolve paths
    const projectPath = input.path ?? process.cwd();
    const srcPath = join(projectPath, "src");
    const proceduresPath = join(srcPath, "procedures");
    const namespacePath = join(proceduresPath, namespace);
    const procedureFile = join(namespacePath, `${procedureName}.ts`);
    const namespaceIndex = join(namespacePath, "index.ts");
    const typesFile = join(srcPath, "types.ts");
    const description = input.description ?? `${segments.join(".")} procedure`;
    if (input.dryRun) {
        // Preview mode
        const dryRunOps = [
            `Would create directory: ${namespacePath}`,
            `Would create procedure file: ${procedureFile}`,
            `Would create/update index: ${namespaceIndex}`,
            `Would append types to: ${typesFile}`,
            `Note: You'll need to manually add registration to register.ts`,
        ];
        return {
            success: true,
            procedurePath: segments,
            created: [procedureFile, namespaceIndex].filter((f) => !pathExists(f, ctx)),
            modified: [typesFile, namespaceIndex].filter(async (f) => await pathExists(f, ctx)),
            operations: dryRunOps,
            errors: [],
        };
    }
    try {
        // Step 1: Create namespace directory
        if (!(await pathExists(namespacePath, ctx))) {
            operations.push(`Creating directory: ${namespacePath}`);
            await ctx.client.call(["fs", "mkdir"], { path: namespacePath, recursive: true });
            created.push(namespacePath);
        }
        // Step 2: Create procedure file
        if (await pathExists(procedureFile, ctx)) {
            errors.push(`Procedure file already exists: ${procedureFile}`);
            return {
                success: false,
                procedurePath: segments,
                created,
                modified,
                operations,
                errors,
            };
        }
        operations.push(`Creating procedure file: ${procedureFile}`);
        const procedureContent = generateProcedureFile(segments, description);
        await ctx.client.call(["fs", "write"], { path: procedureFile, content: procedureContent });
        created.push(procedureFile);
        // Step 3: Create/update namespace index.ts
        const indexExport = generateIndexExport(procedureName, camelName);
        if (await pathExists(namespaceIndex, ctx)) {
            operations.push(`Updating index: ${namespaceIndex}`);
            const readResult = await ctx.client.call(["fs", "read"], { path: namespaceIndex });
            const existingContent = readResult.content;
            if (!existingContent.includes(`from "./${procedureName}.js"`)) {
                await ctx.client.call(["fs", "write"], { path: namespaceIndex, content: existingContent + indexExport });
                modified.push(namespaceIndex);
            }
        }
        else {
            operations.push(`Creating index: ${namespaceIndex}`);
            await ctx.client.call(["fs", "write"], { path: namespaceIndex, content: indexExport });
            created.push(namespaceIndex);
        }
        // Step 4: Add types to types.ts
        if (await pathExists(typesFile, ctx)) {
            operations.push(`Appending types to: ${typesFile}`);
            const readResult = await ctx.client.call(["fs", "read"], { path: typesFile });
            const existingTypes = readResult.content;
            if (!existingTypes.includes(`${pascalName}Input`)) {
                const newTypes = generateTypes(segments, description);
                await ctx.client.call(["fs", "write"], { path: typesFile, content: existingTypes + newTypes });
                modified.push(typesFile);
            }
            else {
                operations.push(`Types for ${pascalName} already exist, skipping`);
            }
        }
        else {
            errors.push(`types.ts not found at ${typesFile}`);
        }
        // Step 5: Remind about registration
        operations.push(`
Next steps:
1. Implement the procedure logic in ${procedureFile}
2. Add registration to register.ts:

   import { ${camelName} } from "./procedures/${namespace}/${procedureName}.js";
   import { ${pascalName}InputSchema, type ${pascalName}Input, type ${pascalName}Output } from "./types.js";

   const ${camelName}InputSchema = zodAdapter<${pascalName}Input>(${pascalName}InputSchema);
   const ${camelName}OutputSchema = outputSchema<${pascalName}Output>();

   const ${camelName}Procedure = createProcedure()
     .path(${JSON.stringify(segments)})
     .input(${camelName}InputSchema)
     .output(${camelName}OutputSchema)
     .meta({
       description: "${description}",
       args: [],
       shorts: {},
       output: "text",
     })
     .handler(async (input: ${pascalName}Input): Promise<${pascalName}Output> => {
       return ${camelName}(input);
     })
     .build();

   // Add to registerProcedures array
`);
        return {
            success: errors.length === 0,
            procedurePath: segments,
            created,
            modified,
            operations,
            errors,
        };
    }
    catch (error) {
        return {
            success: false,
            procedurePath: segments,
            created,
            modified,
            operations,
            errors: [...errors, error instanceof Error ? error.message : String(error)],
        };
    }
}
//# sourceMappingURL=new.js.map