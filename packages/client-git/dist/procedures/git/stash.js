/**
 * git.stash.* procedures
 *
 * Stash operations for saving and restoring work in progress.
 * Includes export/import for snapshot storage.
 */
import { execSync } from "node:child_process";
/**
 * List all stashes
 */
export async function gitStashList(input) {
    const cwd = input.cwd || process.cwd();
    const opts = { cwd, encoding: "utf8" };
    try {
        // Get stash list with format: stash@{n}: WIP on branch: message
        const output = execSync("git stash list --format=%H%x00%gd%x00%gs", opts);
        const stashes = [];
        for (const line of output.split("\n").filter(Boolean)) {
            const parts = line.split("\0");
            const hash = parts[0] || "";
            const ref = parts[1] || "";
            const message = parts[2] || "";
            // Extract index from stash@{n}
            const indexMatch = ref.match(/stash@\{(\d+)\}/);
            const index = indexMatch && indexMatch[1] ? parseInt(indexMatch[1], 10) : 0;
            stashes.push({
                index,
                ref,
                hash,
                message,
            });
        }
        return { stashes, count: stashes.length };
    }
    catch {
        // No stashes or not a git repo
        return { stashes: [], count: 0 };
    }
}
/**
 * Push changes to stash
 */
export async function gitStashPush(input) {
    const cwd = input.cwd || process.cwd();
    const opts = { cwd, encoding: "utf8" };
    const args = ["stash", "push"];
    if (input.message) {
        args.push("-m", input.message);
    }
    if (input.includeUntracked) {
        args.push("--include-untracked");
    }
    if (input.keepIndex) {
        args.push("--keep-index");
    }
    if (input.paths && input.paths.length > 0) {
        args.push("--");
        args.push(...input.paths);
    }
    const command = ["git", ...args].map(arg => arg.includes(" ") ? `"${arg}"` : arg).join(" ");
    try {
        const output = execSync(command, opts);
        // Check if anything was stashed
        if (output.includes("No local changes to save")) {
            return { stashed: false, message: "No local changes to save" };
        }
        // Get the ref of the new stash
        const refOutput = execSync("git stash list -1 --format=%gd", opts).trim();
        return {
            stashed: true,
            ref: refOutput || "stash@{0}",
            message: input.message || "WIP",
        };
    }
    catch (error) {
        const err = error;
        return { stashed: false, message: err.message || "Failed to stash" };
    }
}
/**
 * Pop stash (apply and remove)
 */
export async function gitStashPop(input) {
    const cwd = input.cwd || process.cwd();
    const opts = { cwd, encoding: "utf8" };
    const ref = input.index !== undefined ? `stash@{${input.index}}` : "stash@{0}";
    try {
        execSync(`git stash pop ${ref}`, opts);
        return { applied: true, ref, dropped: true };
    }
    catch (error) {
        const err = error;
        // Check if it's a conflict
        if (err.message?.includes("conflict")) {
            return { applied: false, ref, dropped: false, conflict: true };
        }
        return { applied: false, ref, dropped: false };
    }
}
/**
 * Apply stash without removing
 */
export async function gitStashApply(input) {
    const cwd = input.cwd || process.cwd();
    const opts = { cwd, encoding: "utf8" };
    const ref = input.index !== undefined ? `stash@{${input.index}}` : "stash@{0}";
    try {
        execSync(`git stash apply ${ref}`, opts);
        return { applied: true, ref };
    }
    catch (error) {
        const err = error;
        if (err.message?.includes("conflict")) {
            return { applied: false, ref, conflict: true };
        }
        return { applied: false, ref };
    }
}
/**
 * Drop a stash
 */
export async function gitStashDrop(input) {
    const cwd = input.cwd || process.cwd();
    const opts = { cwd, encoding: "utf8" };
    const ref = input.index !== undefined ? `stash@{${input.index}}` : "stash@{0}";
    try {
        execSync(`git stash drop ${ref}`, opts);
        return { dropped: true, ref };
    }
    catch {
        return { dropped: false, ref };
    }
}
/**
 * Export a stash as a patch (for snapshot storage)
 */
export async function gitStashExport(input) {
    const cwd = input.cwd || process.cwd();
    const opts = { cwd, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 };
    const ref = input.index !== undefined ? `stash@{${input.index}}` : "stash@{0}";
    try {
        // Get the stash as a patch
        const patch = execSync(`git stash show -p ${ref}`, opts);
        // Get metadata
        const metadata = execSync(`git stash list -1 --format=%H%x00%gs ${ref}`, opts).trim();
        const metaParts = metadata.split("\0");
        const hash = metaParts[0] || "";
        const message = metaParts[1] || "";
        // Get untracked files if present (stash^3 contains untracked files if any)
        let untrackedPatch = "";
        try {
            untrackedPatch = execSync(`git show ${ref}^3 --format= --name-only`, opts);
        }
        catch {
            // No untracked files in this stash
        }
        return {
            ref,
            hash,
            message,
            patch,
            hasUntracked: untrackedPatch.length > 0,
            untrackedPatch: untrackedPatch || undefined,
        };
    }
    catch (error) {
        const err = error;
        throw new Error(`Failed to export stash ${ref}: ${err.message}`);
    }
}
/**
 * Import a stash from a patch (for snapshot restore)
 * Note: This creates a new stash, it doesn't recreate the exact stash state
 */
export async function gitStashImport(input) {
    const cwd = input.cwd || process.cwd();
    const opts = { cwd, encoding: "utf8" };
    try {
        // Apply the patch to working directory
        execSync(`git apply --3way`, { ...opts, input: input.patch });
        // Stash the changes with the original message
        const message = input.message || "Imported stash";
        const args = ["stash", "push", "-m", message];
        if (input.includeUntracked) {
            args.push("--include-untracked");
        }
        const command = ["git", ...args].map(arg => arg.includes(" ") ? `"${arg}"` : arg).join(" ");
        execSync(command, opts);
        // Get the new stash ref
        const ref = execSync("git stash list -1 --format=%gd", opts).trim();
        return { imported: true, ref: ref || "stash@{0}" };
    }
    catch (error) {
        const err = error;
        return { imported: false, error: err.message || "Failed to import stash" };
    }
}
//# sourceMappingURL=stash.js.map