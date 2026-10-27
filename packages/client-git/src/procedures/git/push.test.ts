/**
 * The guards of git.push run before the first git call. `git rev-list` reads the range
 * `<remote>/<branch>..HEAD` too, so a remote or a branch that starts with "-" does not reach git.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const calls = vi.hoisted(() => [] as string[][]);

vi.mock("./run.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./run.js")>();
  return {
    ...actual,
    git: vi.fn(async (args: string[]) => {
      calls.push(args);
      return "0\n";
    }),
  };
});

const { gitPush } = await import("./push.js");

describe("git.push guards", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("refuses a remote that starts with - before any git call", async () => {
    await expect(gitPush({ remote: "--all", branch: "main" } as Parameters<typeof gitPush>[0])).rejects.toThrow("Invalid remote");
    await expect(gitPush({ remote: "--all" } as Parameters<typeof gitPush>[0])).rejects.toThrow("Invalid remote");
    expect(calls).toEqual([]);
  });

  it("refuses a branch that starts with - before any git call", async () => {
    await expect(gitPush({ branch: "--receive-pack=x" } as Parameters<typeof gitPush>[0])).rejects.toThrow("Invalid branch");
    expect(calls).toEqual([]);
  });

  it("gives the checked remote and branch to git rev-list and git push", async () => {
    expect(await gitPush({ remote: "origin", branch: "main" } as Parameters<typeof gitPush>[0])).toEqual({ remote: "origin", branch: "main", commits: 0 });
    expect(calls).toEqual([
      ["rev-list", "--count", "origin/main..HEAD"],
      ["push", "origin", "main"],
    ]);
  });
});
