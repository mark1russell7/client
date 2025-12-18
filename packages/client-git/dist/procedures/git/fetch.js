/**
 * git.fetch procedure
 *
 * Fetch from remote without merging
 */
import { execSync } from "node:child_process";
/**
 * Fetch from remote
 */
export async function gitFetch(input) {
    const { branch, all, prune, cwd } = input;
    const remoteName = input.remote ?? "origin";
    const opts = { cwd, encoding: "utf8" };
    const args = ["git", "fetch"];
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
    execSync(args.join(" "), opts);
    return { remote: remoteName, fetched: true };
}
//# sourceMappingURL=fetch.js.map