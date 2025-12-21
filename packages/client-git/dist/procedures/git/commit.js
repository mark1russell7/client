/**
 * git.commit procedure
 *
 * Create commit
 */
import { execSync } from "node:child_process";
/**
 * Create commit
 */
export async function gitCommit(input) {
    const { message, all, amend, cwd } = input;
    const opts = { cwd, encoding: "utf8" };
    // Check if there's anything to commit (unless amending)
    if (!amend) {
        const status = execSync("git status --porcelain", opts).trim();
        if (!status && !all) {
            // Nothing staged and not using -a, skip commit
            return { hash: "", message: "", author: "", date: "", skipped: true };
        }
        // If using -a, check if there are any modified files
        if (all) {
            const hasChanges = status.length > 0;
            if (!hasChanges) {
                return { hash: "", message: "", author: "", date: "", skipped: true };
            }
        }
    }
    const args = ["git", "commit"];
    if (all)
        args.push("-a");
    if (amend)
        args.push("--amend");
    args.push("-m", `"${message.replace(/"/g, '\\"')}"`);
    execSync(args.join(" "), opts);
    // Get commit info
    const format = "--format=%H%n%s%n%an%n%ci";
    const info = execSync(`git log -1 ${format}`, opts).trim();
    const [hash = "", msg = "", author = "", date = ""] = info.split("\n");
    return { hash, message: msg, author, date };
}
//# sourceMappingURL=commit.js.map