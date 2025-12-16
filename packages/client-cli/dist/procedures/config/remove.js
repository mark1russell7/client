/**
 * config.remove procedure
 *
 * Removes a feature from dependencies.json.
 */
import { spawn } from "node:child_process";
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
 * Remove a feature from dependencies.json
 */
export async function configRemove(input) {
    const projectPath = input.path ?? process.cwd();
    // Run cue-config remove
    const result = await runCueConfig(["remove", input.feature], projectPath);
    // Check if not present
    const notPresent = result.stdout.includes("is not in dependencies");
    return {
        success: result.success || notPresent,
        feature: input.feature,
        removed: result.success && !notPresent,
        notPresent,
        errors: result.success || notPresent ? [] : [result.stderr || "Failed to remove feature"],
        output: result.stdout,
    };
}
//# sourceMappingURL=remove.js.map