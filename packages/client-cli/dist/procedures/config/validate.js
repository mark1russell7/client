/**
 * config.validate procedure
 *
 * Validates dependencies.json against the schema.
 */
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
/**
 * Check if a path exists
 */
async function pathExists(path) {
    try {
        await access(path, constants.F_OK);
        return true;
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
 * Validate dependencies.json
 */
export async function configValidate(input) {
    const projectPath = input.path ?? process.cwd();
    // Check if dependencies.json exists
    const depsPath = `${projectPath}/dependencies.json`;
    if (!(await pathExists(depsPath))) {
        return {
            success: false,
            valid: false,
            errors: ["No dependencies.json found"],
        };
    }
    // Run cue-config validate
    const result = await runCueConfig(["validate"], projectPath);
    return {
        success: result.success,
        valid: result.success,
        errors: result.success ? [] : [result.stderr || "Validation failed"],
        output: result.stdout,
    };
}
//# sourceMappingURL=validate.js.map