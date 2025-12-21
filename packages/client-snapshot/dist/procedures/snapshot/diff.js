/**
 * snapshot.diff procedure
 *
 * Compare current state against a snapshot.
 */
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { execSync } from "node:child_process";
/**
 * Compare current state against a snapshot
 */
export async function snapshotDiff(input, ctx) {
    // Download snapshot metadata
    const listResult = await ctx.client.call(["s3", "list"], {
        bucket: input.bucket,
        prefix: `snapshots/`,
    });
    const metadataKey = listResult.contents.find((obj) => obj.key.includes(input.id) && obj.key.endsWith(".metadata.json"))?.key;
    if (!metadataKey) {
        throw new Error(`Snapshot not found: ${input.id}`);
    }
    const metadataResult = await ctx.client.call(["s3", "download"], {
        bucket: input.bucket,
        key: metadataKey,
        encoding: "utf8",
    });
    const snapshotMetadata = JSON.parse(metadataResult.body);
    // Compare each repository
    const repositories = [];
    let totalFilesChanged = 0;
    let reposChanged = 0;
    const pathsToCheck = input.paths || snapshotMetadata.repositories.map((r) => r.path);
    for (const repoPath of pathsToCheck) {
        const snapshotRepo = snapshotMetadata.repositories.find((r) => r.path === repoPath || r.name === basename(repoPath));
        if (!snapshotRepo)
            continue;
        const diff = {
            path: repoPath,
            filesChanged: 0,
            newStashes: 0,
        };
        if (!existsSync(repoPath)) {
            // Repository was deleted
            diff.filesChanged = -1; // Indicates missing
            repositories.push(diff);
            reposChanged++;
            continue;
        }
        try {
            // Get current branch
            const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
                cwd: repoPath,
                encoding: "utf8",
            }).trim();
            if (currentBranch !== snapshotRepo.branch) {
                diff.branchDiff = {
                    current: currentBranch,
                    snapshot: snapshotRepo.branch,
                };
            }
            // Get current commit
            const currentCommit = execSync("git rev-parse HEAD", {
                cwd: repoPath,
                encoding: "utf8",
            }).trim();
            if (currentCommit !== snapshotRepo.commit) {
                diff.commitDiff = {
                    current: currentCommit,
                    snapshot: snapshotRepo.commit,
                };
                // Count files changed since snapshot commit
                try {
                    const diffStat = execSync(`git diff --stat ${snapshotRepo.commit}..HEAD`, { cwd: repoPath, encoding: "utf8" });
                    // Count lines that represent files (contain |)
                    diff.filesChanged = diffStat.split("\n").filter((l) => l.includes("|")).length;
                    totalFilesChanged += diff.filesChanged;
                }
                catch {
                    // Snapshot commit may not exist locally
                    diff.filesChanged = -1;
                }
            }
            // Check for new stashes
            const stashResult = await ctx.client.call(["git", "stash", "list"], { cwd: repoPath });
            diff.newStashes = stashResult.count - snapshotRepo.stashCount;
            if (diff.branchDiff ||
                diff.commitDiff ||
                diff.filesChanged > 0 ||
                diff.newStashes > 0) {
                reposChanged++;
            }
        }
        catch {
            // Not a git repo or error
            diff.filesChanged = -1;
            reposChanged++;
        }
        repositories.push(diff);
    }
    return {
        snapshotMetadata,
        repositories,
        summary: {
            reposChanged,
            totalFilesChanged,
            isMatch: reposChanged === 0,
        },
    };
}
//# sourceMappingURL=diff.js.map