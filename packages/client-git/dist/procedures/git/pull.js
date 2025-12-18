/**
 * git.pull procedure
 *
 * Pull from remote
 */
import { execSync } from "node:child_process";
/**
 * Pull from remote
 */
export async function gitPull(input) {
    const { remote, branch, rebase, cwd } = input;
    const opts = { cwd, encoding: "utf8" };
    // Get current branch if not specified
    const branchName = branch || execSync("git rev-parse --abbrev-ref HEAD", opts).trim();
    // Get current HEAD before pull
    const beforeHead = execSync("git rev-parse HEAD", opts).trim();
    const args = ["git", "pull"];
    if (rebase)
        args.push("--rebase");
    args.push(remote, branchName);
    execSync(args.join(" "), opts);
    // Get new HEAD after pull
    const afterHead = execSync("git rev-parse HEAD", opts).trim();
    // Count new commits
    let commits = 0;
    if (beforeHead !== afterHead) {
        const count = execSync(`git rev-list --count ${beforeHead}..${afterHead}`, opts).trim();
        commits = parseInt(count, 10) || 0;
    }
    // Check if it was fast-forward
    const fastForward = !rebase && beforeHead !== afterHead;
    return { remote, branch: branchName, commits, fastForward };
}
//# sourceMappingURL=pull.js.map