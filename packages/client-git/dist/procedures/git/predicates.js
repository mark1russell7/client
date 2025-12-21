/**
 * Git predicate procedures
 *
 * Simple boolean predicates for conditional execution.
 * These return true/false based on git repository state.
 */
import { execSync } from "node:child_process";
/**
 * Check if there are any changes (unstaged, staged, or untracked)
 */
export async function gitHasChanges(input) {
    const { cwd } = input;
    const opts = { cwd, encoding: "utf8" };
    try {
        const status = execSync("git status --porcelain", opts).trim();
        return { value: status.length > 0 };
    }
    catch {
        return { value: false };
    }
}
/**
 * Check if there are any staged changes ready to commit
 */
export async function gitHasStagedChanges(input) {
    const { cwd } = input;
    const opts = { cwd, encoding: "utf8" };
    try {
        // git diff --cached shows only staged changes
        const diff = execSync("git diff --cached --name-only", opts).trim();
        return { value: diff.length > 0 };
    }
    catch {
        return { value: false };
    }
}
/**
 * Check if there are any unstaged changes (modified or deleted files)
 */
export async function gitHasUnstagedChanges(input) {
    const { cwd } = input;
    const opts = { cwd, encoding: "utf8" };
    try {
        // git diff shows only unstaged changes to tracked files
        const diff = execSync("git diff --name-only", opts).trim();
        return { value: diff.length > 0 };
    }
    catch {
        return { value: false };
    }
}
/**
 * Check if there are any untracked files
 */
export async function gitHasUntrackedFiles(input) {
    const { cwd } = input;
    const opts = { cwd, encoding: "utf8" };
    try {
        // List untracked files only
        const untracked = execSync("git ls-files --others --exclude-standard", opts).trim();
        return { value: untracked.length > 0 };
    }
    catch {
        return { value: false };
    }
}
/**
 * Check if there are local commits that haven't been pushed
 */
export async function gitHasLocalCommits(input) {
    const { cwd } = input;
    const opts = { cwd, encoding: "utf8" };
    try {
        // Get the upstream tracking branch
        const upstream = execSync("git rev-parse --abbrev-ref @{upstream}", opts).trim();
        // Count commits ahead of upstream
        const count = execSync(`git rev-list --count ${upstream}..HEAD`, opts).trim();
        return { value: parseInt(count, 10) > 0 };
    }
    catch {
        // No upstream or error - check if there are any commits at all
        try {
            execSync("git rev-parse HEAD", opts);
            // HEAD exists but no upstream - treat as having local commits
            return { value: true };
        }
        catch {
            return { value: false };
        }
    }
}
/**
 * Check if the working directory is clean (no changes at all)
 */
export async function gitIsClean(input) {
    const result = await gitHasChanges(input);
    return { value: !result.value };
}
//# sourceMappingURL=predicates.js.map