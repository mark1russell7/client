/**
 * git.push procedure
 *
 * Push to remote
 */
import { execSync } from "node:child_process";
/**
 * Push to remote
 */
export async function gitPush(input) {
    const { branch, force, setUpstream, cwd } = input;
    const remoteName = input.remote ?? "origin";
    const opts = { cwd, encoding: "utf8" };
    // Get current branch if not specified
    const branchName = branch || execSync("git rev-parse --abbrev-ref HEAD", opts).trim();
    // Count commits to push
    let commits = 0;
    try {
        const count = execSync(`git rev-list --count ${remoteName}/${branchName}..HEAD`, opts).trim();
        commits = parseInt(count, 10) || 0;
    }
    catch {
        // Remote branch may not exist yet
        const count = execSync("git rev-list --count HEAD", opts).trim();
        commits = parseInt(count, 10) || 0;
    }
    const args = ["git", "push"];
    if (setUpstream)
        args.push("-u");
    if (force)
        args.push("--force");
    args.push(remoteName, branchName);
    execSync(args.join(" "), opts);
    return { remote: remoteName, branch: branchName, commits };
}
//# sourceMappingURL=push.js.map