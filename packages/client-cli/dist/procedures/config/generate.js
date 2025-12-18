/**
 * config.generate procedure
 *
 * Generates configuration files (package.json, tsconfig.json, .gitignore)
 * based on dependencies.json features using cue-config.
 */
import { spawn } from "node:child_process";
/**
 * Check if a path exists
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
 * Execute cue-config command
 */
function runCueConfig(args, cwd) {
    return new Promise((resolve) => {
        const proc = spawn("npx", ["cue-config", ...args], {
            cwd,
            shell: true,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (data) => {
            stdout += data.toString();
        });
        proc.stderr.on("data", (data) => {
            stderr += data.toString();
        });
        proc.on("close", (code) => {
            resolve({
                success: code === 0,
                stdout,
                stderr,
            });
        });
        proc.on("error", (error) => {
            resolve({
                success: false,
                stdout,
                stderr: error.message,
            });
        });
    });
}
/**
 * Generate configuration files from dependencies.json
 */
export async function configGenerate(input, ctx) {
    const projectPath = input.path ?? process.cwd();
    const generated = [];
    const errors = [];
    // Check if dependencies.json exists
    const depsPath = `${projectPath}/dependencies.json`;
    if (!(await pathExists(depsPath, ctx))) {
        return {
            success: false,
            generated: [],
            errors: [
                "No dependencies.json found. Run config.init first or create dependencies.json manually.",
            ],
        };
    }
    // Run cue-config generate
    const result = await runCueConfig(["generate"], projectPath);
    if (!result.success) {
        return {
            success: false,
            generated: [],
            errors: [result.stderr || "Generation failed"],
        };
    }
    // Parse output to determine what was generated
    if (result.stdout.includes("package.json")) {
        generated.push("package.json");
    }
    if (result.stdout.includes("tsconfig.json")) {
        generated.push("tsconfig.json");
    }
    if (result.stdout.includes(".gitignore")) {
        generated.push(".gitignore");
    }
    if (result.stdout.includes("cue.mod")) {
        generated.push("cue.mod/");
    }
    return {
        success: true,
        generated,
        errors,
        output: result.stdout,
    };
}
//# sourceMappingURL=generate.js.map