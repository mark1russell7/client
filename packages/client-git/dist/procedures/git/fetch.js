/**
 * git.fetch procedure
 *
 * Fetch from remote without merging
 */
import { execFileSync } from "node:child_process";
/**
 * Fetch from remote
 */
export async function gitFetch(input) {
    const { branch, all, prune, cwd } = input;
    const remoteName = input.remote ?? "origin";
    const opts = { cwd, encoding: "utf8" };
    const args = ["fetch"];
    if (all) {
        args.push("--all");
    }
    else {
        args.push(remoteName);
        if (branch) {
            args.push(branch);
        }
    }
    if (prune)
        args.push("--prune");
    execFileSync("git", args, opts);
    return { remote: remoteName, fetched: true };
}
//# sourceMappingURL=fetch.js.map