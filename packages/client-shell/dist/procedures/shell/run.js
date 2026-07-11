/**
 * shell.run procedure
 *
 * Run a command with arguments and return output.
 */
import { spawn } from "node:child_process";
export async function shellRun(input) {
    const startTime = Date.now();
    return new Promise((resolve) => {
        const proc = spawn(input.command, input.args, {
            cwd: input.cwd,
            env: input.env ? { ...process.env, ...input.env } : process.env,
            timeout: input.timeout,
            shell: false,
            windowsHide: true,
        });
        let stdout = "";
        let stderr = "";
        proc.stdout?.on("data", (data) => {
            stdout += data.toString(input.encoding);
        });
        proc.stderr?.on("data", (data) => {
            stderr += data.toString(input.encoding);
        });
        proc.on("close", (code) => {
            resolve({
                exitCode: code ?? 1,
                stdout,
                stderr,
                success: code === 0,
                duration: Date.now() - startTime,
            });
        });
        proc.on("error", (err) => {
            resolve({
                exitCode: 1,
                stdout,
                stderr: stderr + err.message,
                success: false,
                duration: Date.now() - startTime,
            });
        });
    });
}
//# sourceMappingURL=run.js.map