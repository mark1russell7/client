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

import { Project, SyntaxKind } from "ts-morph";
import type { ProcedureContext } from "@mark1russell7/client";
import type { LibRenameInput, LibRenameOutput, RenameChange } from "../../types.js";

interface FsGlobOutput { pattern: string; files: string[]; count: number; }
interface FsExistsOutput { exists: boolean; path: string; }
interface FsReadJsonOutput { path: string; data: unknown; }
interface FsWriteOutput { path: string; bytesWritten: number; }

/**
 * Find all package.json files under a root path (excluding node_modules)
 */
async function findPackageJsonFiles(rootPath: string, ctx: ProcedureContext): Promise<string[]> {
  const result = await ctx.client.call<{ pattern: string; cwd?: string; ignore?: string[] }, FsGlobOutput>(
    ["fs", "glob"],
    { pattern: "**/package.json", cwd: rootPath, ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"] }
  );
  return result.files;
}

/**
 * Find all TypeScript files under a root path (excluding node_modules, dist)
 */
async function findTypeScriptFiles(rootPath: string, ctx: ProcedureContext): Promise<string[]> {
  const result = await ctx.client.call<{ pattern: string; cwd?: string; ignore?: string[] }, FsGlobOutput>(
    ["fs", "glob"],
    { pattern: "**/*.{ts,tsx}", cwd: rootPath, ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"] }
  );
  return result.files;
}

/**
 * Update package.json name field
 */
async function updatePackageJsonName(
  pkgPath: string,
  oldName: string,
  newName: string,
  dryRun: boolean,
  ctx: ProcedureContext
): Promise<RenameChange | null> {
  try {
    const result = await ctx.client.call<{ path: string }, FsReadJsonOutput>(
      ["fs", "read.json"],
      { path: pkgPath }
    );
    const pkg = result.data as { name?: string };

    if (pkg.name === oldName) {
      if (!dryRun) {
        pkg.name = newName;
        await ctx.client.call<{ path: string; content: string }, FsWriteOutput>(
          ["fs", "write"],
          { path: pkgPath, content: JSON.stringify(pkg, null, 2) + "\n" }
        );
      }

      return {
        type: "package-name",
        file: pkgPath,
        oldValue: oldName,
        newValue: newName,
      };
    }
  } catch {
    // Skip files we can't parse
  }

  return null;
}

/**
 * Update package.json dependencies
 */
async function updatePackageJsonDependencies(
  pkgPath: string,
  oldName: string,
  newName: string,
  dryRun: boolean,
  ctx: ProcedureContext
): Promise<RenameChange[]> {
  const changes: RenameChange[] = [];

  try {
    const result = await ctx.client.call<{ path: string }, FsReadJsonOutput>(
      ["fs", "read.json"],
      { path: pkgPath }
    );
    const pkg = result.data as Record<string, unknown>;
    let modified = false;

    const depFields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

    for (const field of depFields) {
      const deps = pkg[field] as Record<string, string> | undefined;
      if (deps && oldName in deps) {
        const oldValue = deps[oldName]!;
        let newValue = oldValue;
        if (oldValue.includes(`github:mark1russell7/${oldName.replace("@mark1russell7/", "")}`)) {
          newValue = oldValue.replace(
            `github:mark1russell7/${oldName.replace("@mark1russell7/", "")}`,
            `github:mark1russell7/${newName.replace("@mark1russell7/", "")}`
          );
        }

        if (!dryRun) {
          delete deps[oldName];
          deps[newName] = newValue;
        }

        changes.push({
          type: "dependency",
          file: pkgPath,
          field,
          oldValue: `"${oldName}": "${oldValue}"`,
          newValue: `"${newName}": "${newValue}"`,
        });
        modified = true;
      }
    }

    if (modified && !dryRun) {
      await ctx.client.call<{ path: string; content: string }, FsWriteOutput>(
        ["fs", "write"],
        { path: pkgPath, content: JSON.stringify(pkg, null, 2) + "\n" }
      );
    }
  } catch {
    // Skip files we can't parse
  }

  return changes;
}

/**
 * Update TypeScript imports using ts-morph
 */
function updateTypeScriptImports(
  tsFiles: string[],
  oldName: string,
  newName: string,
  dryRun: boolean
): RenameChange[] {
  const changes: RenameChange[] = [];

  // Create ts-morph project
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  // Add files to project
  for (const filePath of tsFiles) {
    try {
      project.addSourceFileAtPath(filePath);
    } catch {
      // Skip files we can't add
    }
  }

  // Process each source file
  for (const sourceFile of project.getSourceFiles()) {
    let fileModified = false;

    // Find all import declarations
    const importDecls = sourceFile.getImportDeclarations();

    for (const importDecl of importDecls) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();

      // Check if this import matches the old package name
      // Match exact name or subpath imports (e.g., "client" or "client/something")
      if (moduleSpecifier === oldName || moduleSpecifier.startsWith(`${oldName}/`)) {
        const newSpecifier = moduleSpecifier.replace(oldName, newName);

        changes.push({
          type: "import",
          file: sourceFile.getFilePath(),
          line: importDecl.getStartLineNumber(),
          oldValue: `from "${moduleSpecifier}"`,
          newValue: `from "${newSpecifier}"`,
        });

        if (!dryRun) {
          importDecl.setModuleSpecifier(newSpecifier);
          fileModified = true;
        }
      }
    }

    // Also check dynamic imports (import())
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

    for (const call of callExpressions) {
      const expression = call.getExpression();
      if (expression.getKind() === SyntaxKind.ImportKeyword) {
        const args = call.getArguments();
        if (args.length > 0) {
          const arg = args[0]!;
          if (arg.getKind() === SyntaxKind.StringLiteral) {
            const value = arg.getText().slice(1, -1); // Remove quotes
            if (value === oldName || value.startsWith(`${oldName}/`)) {
              const newValue = value.replace(oldName, newName);

              changes.push({
                type: "dynamic-import",
                file: sourceFile.getFilePath(),
                line: call.getStartLineNumber(),
                oldValue: `import("${value}")`,
                newValue: `import("${newValue}")`,
              });

              if (!dryRun) {
                arg.replaceWithText(`"${newValue}"`);
                fileModified = true;
              }
            }
          }
        }
      }
    }

    // Save if modified
    if (fileModified && !dryRun) {
      sourceFile.saveSync();
    }
  }

  return changes;
}

/**
 * Execute the lib.rename procedure
 */
export async function libRename(input: LibRenameInput, ctx: ProcedureContext): Promise<LibRenameOutput> {
  const { oldName, newName, rootPath = process.env["HOME"] + "/git", dryRun = false } = input;

  const changes: RenameChange[] = [];
  const errors: string[] = [];

  // Resolve path
  const resolvedRoot = rootPath.replace(/^~/, process.env["HOME"] ?? "");

  const existsResult = await ctx.client.call<{ path: string }, FsExistsOutput>(
    ["fs", "exists"],
    { path: resolvedRoot }
  );
  if (!existsResult.exists) {
    return {
      success: false,
      changes: [],
      errors: [`Root path does not exist: ${resolvedRoot}`],
      summary: { packageNames: 0, dependencies: 0, imports: 0, total: 0 },
    };
  }

  console.log(`[lib.rename] ${dryRun ? "[DRY RUN] " : ""}Renaming "${oldName}" → "${newName}"`);
  console.log(`[lib.rename] Scanning ${resolvedRoot}...`);

  // Find all package.json files
  const packageJsonFiles = await findPackageJsonFiles(resolvedRoot, ctx);
  console.log(`[lib.rename] Found ${packageJsonFiles.length} package.json files`);

  // Find all TypeScript files
  const tsFiles = await findTypeScriptFiles(resolvedRoot, ctx);
  console.log(`[lib.rename] Found ${tsFiles.length} TypeScript files`);

  // 1. Update package.json name field (find the package being renamed)
  for (const pkgPath of packageJsonFiles) {
    const change = await updatePackageJsonName(pkgPath, oldName, newName, dryRun, ctx);
    if (change) {
      changes.push(change);
      console.log(`[lib.rename] ${dryRun ? "Would update" : "Updated"} package name: ${pkgPath}`);
    }
  }

  // 2. Update package.json dependencies
  for (const pkgPath of packageJsonFiles) {
    const depChanges = await updatePackageJsonDependencies(pkgPath, oldName, newName, dryRun, ctx);
    changes.push(...depChanges);
    if (depChanges.length > 0) {
      console.log(
        `[lib.rename] ${dryRun ? "Would update" : "Updated"} ${depChanges.length} dependencies in: ${pkgPath}`
      );
    }
  }

  // 3. Update TypeScript imports using ts-morph
  try {
    const importChanges = updateTypeScriptImports(tsFiles, oldName, newName, dryRun);
    changes.push(...importChanges);
    if (importChanges.length > 0) {
      console.log(
        `[lib.rename] ${dryRun ? "Would update" : "Updated"} ${importChanges.length} TypeScript imports`
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`Error updating TypeScript imports: ${errorMessage}`);
  }

  // Build summary
  const summary = {
    packageNames: changes.filter((c) => c.type === "package-name").length,
    dependencies: changes.filter((c) => c.type === "dependency").length,
    imports: changes.filter((c) => c.type === "import" || c.type === "dynamic-import").length,
    total: changes.length,
  };

  console.log(`[lib.rename] Summary: ${summary.packageNames} package names, ${summary.dependencies} dependencies, ${summary.imports} imports`);

  return {
    success: errors.length === 0,
    changes,
    errors,
    summary,
  };
}