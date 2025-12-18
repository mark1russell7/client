/**
 * lib.rename Procedure
 *
 * Renames a package across the entire codebase using ts-morph for AST-based
 * import updates and direct file manipulation for package.json updates.
 *
 * Uses:
 * - ts-morph: AST manipulation for TypeScript imports
 * - File system operations for package.json updates
 *
 * @example
 * ```typescript
 * await client.call(["lib", "rename"], {
 *   oldName: "client",
 *   newName: "@mark1russell7/client",
 *   rootPath: "~/git",
 *   dryRun: true, // Preview changes without applying
 * });
 * ```
 */
import { z } from "zod";
import type { ProcedureContext } from "@mark1russell7/client";
import type { LibRenameInput, LibRenameOutput } from "../../types.js";
/**
 * Execute the lib.rename procedure
 */
export declare function libRename(input: LibRenameInput, ctx: ProcedureContext): Promise<LibRenameOutput>;
/**
 * Zod schema for input validation
 */
export declare const LibRenameInputSchema: z.ZodObject<{
    oldName: z.ZodString;
    newName: z.ZodString;
    rootPath: z.ZodOptional<z.ZodString>;
    dryRun: z.ZodOptional<z.ZodBoolean>;
}>;
//# sourceMappingURL=rename.d.ts.map