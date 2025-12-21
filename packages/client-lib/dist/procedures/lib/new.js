/**
 * lib.new procedure
 *
 * Creates a new package with standard ecosystem structure.
 * Reads projectTemplate from ecosystem.manifest.json (single source of truth).
 * Uses fs.* and git.* procedures via ctx.client.call() for all operations.
 */
import { join } from "node:path";
import { homedir } from "node:os";
/**
 * Resolve ~ to home directory
 */
function resolveRoot(root) {
    if (root.startsWith("~/")) {
        return join(homedir(), root.slice(2));
    }
    return root;
}
/**
 * Create a new package with standard ecosystem structure
 */
export async function libNew(input, ctx) {
    const operations = [];
    const created = [];
    const errors = [];
    const rootPath = resolveRoot(input.rootPath ?? "~/git");
    const packagePath = join(rootPath, input.name);
    const packageName = `@mark1russell7/${input.name}`;
    // Load manifest to get projectTemplate (single source of truth)
    let manifest = null;
    const manifestPath = join(rootPath, "ecosystem", "ecosystem.manifest.json");
    try {
        const result = await ctx.client.call(["fs", "read.json"], { path: manifestPath });
        manifest = result.data;
    }
    catch {
        // Manifest doesn't exist, will use defaults
    }
    const template = manifest?.projectTemplate ?? {
        files: ["package.json", "tsconfig.json", "dependencies.json", ".gitignore"],
        dirs: ["src", "dist"],
    };
    // Filter out 'dist' from required dirs (created on build)
    const requiredDirs = template.dirs.filter((d) => d !== "dist");
    // Check if package already exists
    const existsResult = await ctx.client.call(["fs", "exists"], { path: packagePath });
    if (existsResult.exists) {
        return {
            success: false,
            packageName,
            packagePath,
            created: [],
            operations: [],
            errors: [`Package directory already exists: ${packagePath}`],
        };
    }
    if (input.dryRun) {
        const dryRunCreated = [
            `${packagePath}/`,
            ...requiredDirs.map((d) => `${packagePath}/${d}/`),
            `${packagePath}/src/index.ts`,
            ...template.files.map((f) => `${packagePath}/${f}`),
        ];
        return {
            success: true,
            packageName,
            packagePath,
            created: dryRunCreated,
            operations: [
                `Using projectTemplate from ${manifest ? "ecosystem.manifest.json" : "defaults"}`,
                "Would create directory structure",
                `Would run cue-config init --preset ${input.preset}`,
                "Would run cue-config generate",
                ...(input.skipGit ? [] : ["Would run git init", "Would create GitHub repo", "Would push to origin"]),
                ...(input.skipManifest ? [] : ["Would add to ecosystem manifest"]),
            ],
            errors: [],
        };
    }
    try {
        // Step 1: Create directory structure from template
        operations.push(`Using projectTemplate from ${manifest ? "ecosystem.manifest.json" : "defaults"}`);
        operations.push("Creating directory structure");
        await ctx.client.call(["fs", "mkdir"], { path: packagePath, recursive: true });
        created.push(`${packagePath}/`);
        // Create required directories from template
        for (const dir of requiredDirs) {
            const dirPath = join(packagePath, dir);
            await ctx.client.call(["fs", "mkdir"], { path: dirPath, recursive: true });
            created.push(`${dirPath}/`);
        }
        // Create entry point in src if src exists
        if (requiredDirs.includes("src")) {
            const indexPath = join(packagePath, "src", "index.ts");
            await ctx.client.call(["fs", "write"], { path: indexPath, content: "// Entry point\nexport {};\n" });
            created.push(indexPath);
        }
        // Step 2: Run cue-config init
        operations.push(`Running cue-config init --preset ${input.preset}`);
        await ctx.client.call(["shell", "exec"], {
            command: `npx cue-config init --preset ${input.preset} --force`,
            cwd: packagePath,
        });
        created.push(join(packagePath, "dependencies.json"));
        // Step 3: Run cue-config generate
        operations.push("Running cue-config generate");
        await ctx.client.call(["shell", "exec"], {
            command: "npx cue-config generate",
            cwd: packagePath,
        });
        created.push(join(packagePath, "package.json"));
        created.push(join(packagePath, "tsconfig.json"));
        created.push(join(packagePath, ".gitignore"));
        // Step 4: Git operations
        if (!input.skipGit) {
            operations.push("Initializing git repository");
            await ctx.client.call(["git", "init"], { cwd: packagePath });
            await ctx.client.call(["git", "add"], { all: true, cwd: packagePath });
            await ctx.client.call(["git", "commit"], { message: "Initial commit", cwd: packagePath });
            operations.push("Creating GitHub repository");
            try {
                await ctx.client.call(["shell", "exec"], {
                    command: `gh repo create mark1russell7/${input.name} --private --source . --push`,
                    cwd: packagePath,
                });
                operations.push("Pushed to GitHub");
            }
            catch (ghError) {
                // GitHub repo might already exist or gh not available
                errors.push(`GitHub repo creation may have failed: ${ghError}`);
            }
        }
        // Step 5: Add to ecosystem manifest
        if (!input.skipManifest) {
            operations.push("Adding to ecosystem manifest");
            const manifestPath = join(rootPath, "ecosystem", "ecosystem.manifest.json");
            const manifestExistsResult = await ctx.client.call(["fs", "exists"], { path: manifestPath });
            if (manifestExistsResult.exists) {
                const manifestReadResult = await ctx.client.call(["fs", "read.json"], { path: manifestPath });
                const manifest = manifestReadResult.data;
                if (!manifest.packages[packageName]) {
                    manifest.packages[packageName] = {
                        repo: `github:mark1russell7/${input.name}#main`,
                        path: input.name,
                    };
                    await ctx.client.call(["fs", "write"], { path: manifestPath, content: JSON.stringify(manifest, null, 2) + "\n" });
                    operations.push(`Added ${packageName} to ecosystem manifest`);
                }
                else {
                    operations.push(`${packageName} already in ecosystem manifest`);
                }
            }
            else {
                errors.push("Ecosystem manifest not found, skipping");
            }
        }
        return {
            success: errors.length === 0,
            packageName,
            packagePath,
            created,
            operations,
            errors,
        };
    }
    catch (error) {
        return {
            success: false,
            packageName,
            packagePath,
            created,
            operations,
            errors: [...errors, error instanceof Error ? error.message : String(error)],
        };
    }
}
//# sourceMappingURL=new.js.map