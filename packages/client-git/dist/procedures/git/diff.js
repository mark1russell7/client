/**
 * git.diff procedure
 *
 * Show changes
 */
import { execSync } from "node:child_process";
/**
 * Show changes
 */
export async function gitDiff(input) {
    const { staged, ref, paths, stat, cwd } = input;
    const opts = { cwd, encoding: "utf8" };
    const args = ["git", "diff"];
    if (staged)
        args.push("--cached");
    if (ref)
        args.push(ref);
    args.push("--numstat");
    if (paths && paths.length > 0) {
        args.push("--", ...paths.map(p => `"${p}"`));
    }
    const numstatOutput = execSync(args.join(" "), opts);
    const files = [];
    let totalAdditions = 0;
    let totalDeletions = 0;
    for (const line of numstatOutput.split("\n").filter(Boolean)) {
        const parts = line.split(/\s+/);
        const add = parts[0] ?? "0";
        const del = parts[1] ?? "0";
        const filePath = parts[2] ?? "";
        const additions = add === "-" ? 0 : parseInt(add, 10);
        const deletions = del === "-" ? 0 : parseInt(del, 10);
        totalAdditions += additions;
        totalDeletions += deletions;
        files.push({ path: filePath, additions, deletions });
    }
    const result = {
        files,
        additions: totalAdditions,
        deletions: totalDeletions,
    };
    // Include full diff if not stat-only
    if (!stat) {
        const diffArgs = ["git", "diff"];
        if (staged)
            diffArgs.push("--cached");
        if (ref)
            diffArgs.push(ref);
        if (paths && paths.length > 0) {
            diffArgs.push("--", ...paths.map(p => `"${p}"`));
        }
        result.diff = execSync(diffArgs.join(" "), opts);
    }
    return result;
}
//# sourceMappingURL=diff.js.map