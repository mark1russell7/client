/**
 * git.init procedure
 *
 * Initialize a git repository
 */
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
/**
 * Initialize a git repository
 */
export async function gitInit(input, ctx) {
    const cwd = input.cwd ? resolve(input.cwd) : process.cwd();
    const opts = { cwd, encoding: "utf8" };
    // Check if already a git repo
    const gitDir = join(cwd, ".git");
    const existsResult = await ctx.client.call(["fs", "exists"], { path: gitDir });
    const alreadyExists = existsResult.exists;
    if (!alreadyExists) {
        const args = ["init"];
        if (input.bare) {
            args.push("--bare");
        }
        if (input.initialBranch) {
            args.push(`--initial-branch=${input.initialBranch}`);
        }
        execFileSync("git", args, opts);
    }
    return {
        path: cwd,
        created: !alreadyExists,
    };
}
//# sourceMappingURL=init.js.map