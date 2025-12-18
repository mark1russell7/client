/**
 * git.clone procedure
 *
 * Clone repository
 */
import { execSync } from "node:child_process";
import { join, basename } from "node:path";
/**
 * Clone repository
 */
export async function gitClone(input) {
    const { url, dest, branch, depth, cwd } = input;
    const opts = { cwd, encoding: "utf8" };
    // Determine destination directory
    const destDir = dest || basename(url, ".git").replace(/\.git$/, "");
    const fullPath = cwd ? join(cwd, destDir) : destDir;
    const args = ["git", "clone"];
    if (branch)
        args.push("-b", branch);
    if (depth)
        args.push("--depth", String(depth));
    args.push(url, destDir);
    execSync(args.join(" "), opts);
    // Get the branch that was checked out
    const clonedBranch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: fullPath,
        encoding: "utf8",
    }).trim();
    return { path: fullPath, branch: clonedBranch };
}
//# sourceMappingURL=clone.js.map