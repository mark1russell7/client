/**
 * snapshot.diff procedure
 *
 * Compare current state against a snapshot.
 */

import { existsSync } from "node:fs";
import { basename } from "node:path";
import { gitText } from "./commands.js";
import type { ProcedureContext } from "@mark1russell7/client";
import type {
  SnapshotDiffInput,
  SnapshotDiffOutput,
  SnapshotDiffRepository,
  SnapshotMetadata,
} from "../../types.js";
import { listAllObjects, findSnapshotKey } from "./s3-lookup.js";

/**
 * Compare current state against a snapshot
 */
export async function snapshotDiff(
  input: SnapshotDiffInput,
  ctx: ProcedureContext
): Promise<SnapshotDiffOutput> {
  // Download snapshot metadata (paginated listing, exact basename match).
  const objects = await listAllObjects(ctx, input.bucket, "snapshots/");
  const metadataKey = findSnapshotKey(objects, input.id, ".metadata.json");

  if (!metadataKey) {
    throw new Error(`Snapshot not found: ${input.id}`);
  }

  const metadataResult = await ctx.client.call<
    { bucket: string; key: string; encoding?: string },
    { body: string }
  >(["s3", "download"], {
    bucket: input.bucket,
    key: metadataKey,
    encoding: "utf8",
  });

  const snapshotMetadata: SnapshotMetadata = JSON.parse(metadataResult.body);

  // Compare each repository
  const repositories: SnapshotDiffRepository[] = [];
  let totalFilesChanged = 0;
  let reposChanged = 0;

  const pathsToCheck = input.paths || snapshotMetadata.repositories.map((r) => r.path);

  for (const repoPath of pathsToCheck) {
    const snapshotRepo = snapshotMetadata.repositories.find(
      (r) => r.path === repoPath || r.name === basename(repoPath)
    );

    if (!snapshotRepo) continue;

    const diff: SnapshotDiffRepository = {
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
      // Get current branch (a failure is an error of this repository: the catch below)
      const currentBranch = await gitText(["rev-parse", "--abbrev-ref", "HEAD"], repoPath, ctx.signal);
      if (currentBranch === undefined) throw new Error(`git cannot read the branch of ${repoPath}`);

      if (currentBranch !== snapshotRepo.branch) {
        diff.branchDiff = {
          current: currentBranch,
          snapshot: snapshotRepo.branch,
        };
      }

      // Get current commit
      const currentCommit = await gitText(["rev-parse", "HEAD"], repoPath, ctx.signal);
      if (currentCommit === undefined) throw new Error(`git cannot read the commit of ${repoPath}`);

      if (currentCommit !== snapshotRepo.commit) {
        diff.commitDiff = {
          current: currentCommit,
          snapshot: snapshotRepo.commit,
        };

        // Count files changed since snapshot commit.
        // The commit comes from snapshot metadata downloaded from S3: accept only a hex
        // object name, and pass it as an argument (no shell), so it cannot inject a command.
        try {
          if (!/^[0-9a-f]{7,64}$/i.test(snapshotRepo.commit)) {
            throw new Error(`Not a commit hash: ${snapshotRepo.commit}`);
          }
          const diffStat = await gitText(["diff", "--stat", `${snapshotRepo.commit}..HEAD`], repoPath, ctx.signal);
          if (diffStat === undefined) throw new Error(`git cannot compare ${snapshotRepo.commit} with HEAD`);
          // Count lines that represent files (contain |)
          diff.filesChanged = diffStat.split("\n").filter((l) => l.includes("|")).length;
          totalFilesChanged += diff.filesChanged;
        } catch {
          // Snapshot commit may not exist locally
          diff.filesChanged = -1;
        }
      }

      // Check for new stashes
      const stashResult = await ctx.client.call<
        { cwd?: string },
        { count: number }
      >(["git", "stash", "list"], { cwd: repoPath });

      diff.newStashes = stashResult.count - snapshotRepo.stashCount;

      if (
        diff.branchDiff ||
        diff.commitDiff ||
        diff.filesChanged > 0 ||
        diff.newStashes > 0
      ) {
        reposChanged++;
      }
    } catch {
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
