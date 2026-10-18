/**
 * snapshot.diff procedure
 *
 * Compare current state against a snapshot.
 */

import { existsSync } from "node:fs";
import { basename } from "node:path";
import type { ProcedureContext } from "@procedures/client";
import { isOutsideRoot } from "@procedures/fs/root";
import { gitCall } from "./commands.js";
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
      const currentBranch = (await gitCall<{ value: string }>(ctx, ["git", "revParse"], { cwd: repoPath, abbrevRef: true }))?.value;
      if (currentBranch === undefined) throw new Error(`git cannot read the branch of ${repoPath}`);

      if (currentBranch !== snapshotRepo.branch) {
        diff.branchDiff = {
          current: currentBranch,
          snapshot: snapshotRepo.branch,
        };
      }

      // Get current commit
      const currentCommit = (await gitCall<{ value: string }>(ctx, ["git", "revParse"], { cwd: repoPath }))?.value;
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
          const changes = await gitCall<{ files: unknown[] }>(ctx, ["git", "diff"], { cwd: repoPath, ref: `${snapshotRepo.commit}..HEAD`, stat: true });
          if (changes === undefined) throw new Error(`git cannot compare ${snapshotRepo.commit} with HEAD`);
          // One entry for each file that changed, also a binary file
          diff.filesChanged = changes.files.length;
          totalFilesChanged += diff.filesChanged;
        } catch (error) {
          if (isOutsideRoot(error)) throw error;
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
    } catch (error) {
      // A refusal of the root is not "no repository": the repository is there, and the root refuses it
      if (isOutsideRoot(error)) throw error;
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
