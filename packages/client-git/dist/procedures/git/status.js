/**
 * git.status procedure
 *
 * Get git status
 */
import { execSync } from "node:child_process";
/**
 * Get git status
 */
export async function gitStatus(input) {
    const { cwd } = input;
    const opts = { cwd, encoding: "utf8" };
    // Get current branch
    const branch = execSync("git rev-parse --abbrev-ref HEAD", opts).trim();
    // Get ahead/behind count
    let ahead = 0;
    let behind = 0;
    try {
        const tracking = execSync("git rev-parse --abbrev-ref @{upstream}", opts).trim();
        if (tracking) {
            const counts = execSync(`git rev-list --left-right --count ${tracking}...HEAD`, opts).trim();
            const [b, a] = counts.split(/\s+/).map(Number);
            behind = b || 0;
            ahead = a || 0;
        }
    }
    catch {
        // No upstream or not tracking
    }
    // Get file statuses using porcelain format
    const statusOutput = execSync("git status --porcelain", opts);
    const files = [];
    for (const line of statusOutput.split("\n").filter(Boolean)) {
        const index = line[0];
        const worktree = line[1];
        const path = line.slice(3);
        let status = "modified";
        let staged = false;
        if (index === "?" && worktree === "?") {
            status = "untracked";
        }
        else if (index === "!" && worktree === "!") {
            status = "ignored";
        }
        else {
            if (index === "A") {
                status = "added";
                staged = true;
            }
            else if (index === "D") {
                status = "deleted";
                staged = true;
            }
            else if (index === "R") {
                status = "renamed";
                staged = true;
            }
            else if (index === "C") {
                status = "copied";
                staged = true;
            }
            else if (index === "M") {
                status = "modified";
                staged = true;
            }
            else if (worktree === "M") {
                status = "modified";
            }
            else if (worktree === "D") {
                status = "deleted";
            }
            else if (worktree === "A") {
                status = "added";
            }
        }
        files.push({ path, status, staged });
    }
    return {
        branch,
        ahead,
        behind,
        files,
        clean: files.length === 0,
    };
}
//# sourceMappingURL=status.js.map