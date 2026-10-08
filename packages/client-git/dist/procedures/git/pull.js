/**
 * git.pull procedure
 *
 * Pull from remote
 */
import { execFileSync } from "node:child_process";
/**
 * Pull from remote
 */
export async function gitPull(input) {
    const { branch, rebase, cwd } = input;
    const remoteName = input.remote ?? "origin";
    const opts = { cwd, encoding: "utf8" };
    // Get current branch if not specified
    const branchName = branch || execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], opts).trim();
    // Get current HEAD before pull
    const beforeHead = execFileSync("git", ["rev-parse", "HEAD"], opts).trim();
    const args = ["pull"];
    if (rebase)
        args.push("--rebase");
    args.push(remoteName, branchName);
    execFileSync("git", args, opts);
    // Get new HEAD after pull
    const afterHead = execFileSync("git", ["rev-parse", "HEAD"], opts).trim();
    // Count new commits
    let commits = 0;
    if (beforeHead !== afterHead) {
        const count = execFileSync("git", ["rev-list", "--count", `${beforeHead}..${afterHead}`], opts).trim();
        commits = parseInt(count, 10) || 0;
    }
    // Check if it was fast-forward
    const fastForward = !rebase && beforeHead !== afterHead;
    return { remote: remoteName, branch: branchName, commits, fastForward };
}
//# sourceMappingURL=pull.js.map