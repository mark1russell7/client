import { spawn } from "node:child_process";
export async function vitestRun(input, _ctx) {
    const cwd = input.cwd ?? process.cwd();
    const args = ["vitest", "run", "--reporter", "json"];
    if (input.include?.length) {
        args.push(...input.include);
    }
    if (input.exclude?.length) {
        for (const pattern of input.exclude) {
            args.push("--exclude", pattern);
        }
    }
    if (input.coverage) {
        args.push("--coverage");
    }
    if (input.passWithNoTests) {
        args.push("--passWithNoTests");
    }
    return new Promise((resolve, reject) => {
        let stdout = "";
        const proc = spawn("npx", args, {
            cwd,
            shell: true,
            stdio: ["pipe", "pipe", "pipe"],
        });
        proc.stdout.on("data", (data) => { stdout += data.toString(); });
        proc.stderr.on("data", () => { });
        proc.on("close", (code) => {
            try {
                const jsonMatch = stdout.match(/\{[\s\S]*"success"[\s\S]*\}/);
                if (jsonMatch) {
                    const result = JSON.parse(jsonMatch[0]);
                    resolve({
                        success: result.success ?? code === 0,
                        passed: result.numPassedTests ?? 0,
                        failed: result.numFailedTests ?? 0,
                        skipped: result.numPendingTests ?? 0,
                        duration: result.startTime ? Date.now() - result.startTime : 0,
                    });
                }
                else {
                    resolve({
                        success: code === 0,
                        passed: 0,
                        failed: code === 0 ? 0 : 1,
                        skipped: 0,
                        duration: 0,
                    });
                }
            }
            catch {
                resolve({
                    success: code === 0,
                    passed: 0,
                    failed: code === 0 ? 0 : 1,
                    skipped: 0,
                    duration: 0,
                });
            }
        });
        proc.on("error", reject);
    });
}
//# sourceMappingURL=run.js.map