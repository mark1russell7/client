/**
 * git.branch procedure
 *
 * Branch operations
 */
import { execSync } from "node:child_process";
/**
 * Branch operations
 */
export async function gitBranch(input) {
    const { name, delete: del, list, remote, cwd } = input;
    const opts = { cwd, encoding: "utf8" };
    // Get current branch
    const current = execSync("git rev-parse --abbrev-ref HEAD", opts).trim();
    // Delete branch
    if (del && name) {
        execSync(`git branch -d "${name}"`, opts);
        return { deleted: name, current };
    }
    // Create branch
    if (name && !list) {
        execSync(`git branch "${name}"`, opts);
        return { created: name, current };
    }
    // List branches
    const args = ["git", "branch"];
    if (remote)
        args.push("-a");
    args.push("--format=%(refname:short)|%(HEAD)|%(upstream:short)");
    const output = execSync(args.join(" "), opts);
    const branches = output
        .split("\n")
        .filter(Boolean)
        .map(line => {
        const parts = line.split("|");
        const branchName = parts[0] ?? "";
        const head = parts[1] ?? "";
        const trackingVal = parts[2];
        const isRemote = branchName.startsWith("remotes/") || branchName.includes("/");
        const result = {
            name: branchName.replace(/^remotes\//, ""),
            current: head === "*",
            remote: isRemote,
        };
        if (trackingVal) {
            result.tracking = trackingVal;
        }
        return result;
    });
    return { branches, current };
}
//# sourceMappingURL=branch.js.map