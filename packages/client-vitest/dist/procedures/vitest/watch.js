import { spawn } from "node:child_process";
export async function vitestWatch(input, _ctx) {
    const cwd = input.cwd ?? process.cwd();
    const args = ["vitest", "watch"];
    if (input.include?.length) {
        args.push(...input.include);
    }
    const proc = spawn("npx", args, {
        cwd,
        shell: true,
        detached: true,
        stdio: "ignore",
    });
    proc.unref();
    return {
        pid: proc.pid ?? 0,
        status: "started",
    };
}
//# sourceMappingURL=watch.js.map