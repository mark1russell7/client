/**
 * shell.which procedure
 *
 * Find the full path to a command.
 */
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
const execAsync = promisify(execCb);
export async function shellWhich(input) {
    const isWindows = process.platform === "win32";
    const cmd = isWindows ? `where ${input.command}` : `which ${input.command}`;
    try {
        const { stdout } = await execAsync(cmd);
        const path = stdout.trim().split("\n")[0]?.trim() ?? null;
        return {
            path,
            found: path !== null && path.length > 0,
        };
    }
    catch {
        return {
            path: null,
            found: false,
        };
    }
}
//# sourceMappingURL=which.js.map