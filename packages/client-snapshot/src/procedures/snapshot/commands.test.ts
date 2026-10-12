/**
 * The snapshot procedures run git and pnpm through runCommand: async, with the signal, and no
 * shell. Before, they used execSync, which blocked the event loop, ignored the signal, and ran
 * a shell.
 */

import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitText, pnpmVersion } from "./commands.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A git repository with one commit and the remote "origin". */
function repository(): string {
  const dir = mkdtempSync(join(tmpdir(), "snapshot-git-"));
  dirs.push(dir);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  writeFileSync(join(dir, "a.txt"), "a\n");
  git("add", "a.txt");
  git("commit", "-q", "-m", "first");
  git("remote", "add", "origin", "https://example.com/proj.git");
  return dir;
}

describe("snapshot commands", () => {
  it("reads the commit and the remote of a repository", async () => {
    const dir = repository();
    expect(await gitText(["rev-parse", "HEAD"], dir)).toMatch(/^[0-9a-f]{40}$/);
    expect(await gitText(["remote", "get-url", "origin"], dir)).toBe("https://example.com/proj.git");
  });

  it("gives undefined for a failed command, and for an aborted signal", async () => {
    const dir = repository();
    expect(await gitText(["remote", "get-url", "upstream"], dir)).toBeUndefined();
    const controller = new AbortController();
    controller.abort();
    expect(await gitText(["rev-parse", "HEAD"], dir, controller.signal)).toBeUndefined();
  });

  it("passes each argument as it is: shell syntax runs nothing", async () => {
    const dir = repository();
    expect(await gitText(["rev-parse", "HEAD & echo injected"], dir)).toBeUndefined();
  });

  it("reads the pnpm version", async () => {
    expect(await pnpmVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
