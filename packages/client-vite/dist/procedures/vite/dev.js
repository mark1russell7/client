/**
 * vite.dev procedure - Start Vite dev server
 */
import { spawn } from "child_process";
import { serverManager } from "../../server-manager.js";
export async function viteDev(input) {
    const { cwd, port, host, open } = input;
    const args = ["vite"];
    if (port)
        args.push("--port", String(port));
    if (host)
        args.push("--host", host);
    if (open)
        args.push("--open");
    const child = spawn("npx", args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
    });
    const serverId = serverManager.register(child, "");
    const url = await serverManager.waitForReady(serverId);
    return {
        serverId,
        url,
        pid: child.pid ?? 0,
    };
}
//# sourceMappingURL=dev.js.map