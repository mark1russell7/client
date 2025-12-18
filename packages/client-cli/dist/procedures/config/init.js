/**
 * config.init procedure
 *
 * Initializes a project with dependencies.json using a preset.
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
 * Initialize project configuration
 */
export async function configInit(input, ctx) {
    const projectPath = input.path ?? process.cwd();
    const preset = input.preset ?? "lib";
    // Check if dependencies.json already exists
    const depsPath = `${projectPath}/dependencies.json`;
    if ((await pathExists(depsPath, ctx)) && !input.force) {
        return {
            success: false,
            preset,
            created: [],
            errors: ["dependencies.json already exists. Use force: true to overwrite."],
        };
    }
    // Build args
    const args = ["init", "--preset", preset];
    if (input.force) {
        args.push("--force");
    }
    // Run cue-config init
    const result = await runCueConfig(args, projectPath);
    if (!result.success) {
        return {
            success: false,
            preset,
            created: [],
            errors: [result.stderr || "Initialization failed"],
        };
    }
    // Determine what was created
    const created = ["dependencies.json"];
    if (result.stdout.includes("src/index.ts")) {
        created.push("src/index.ts");
    }
    return {
        success: true,
        preset,
        created,
        errors: [],
        output: result.stdout,
    };
}
//# sourceMappingURL=init.js.map