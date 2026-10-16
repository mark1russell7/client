import { describe, expect, it } from "vitest";
import { CLAUDE_ENV, claudeCandidates, findClaude } from "./executable.js";

const none = (): boolean => false;

describe("claudeCandidates", () => {
  it("looks for claude.exe on the PATH of Windows, then in the install folders", () => {
    expect(claudeCandidates("win32", { Path: "D:\\bin;;E:\\tools", USERPROFILE: "D:\\Users\\example" })).toEqual([
      "D:\\bin\\claude.exe",
      "E:\\tools\\claude.exe",
      "D:\\Users\\example\\.local\\bin\\claude.exe",
      "D:\\Users\\example\\.claude\\local\\claude.exe",
    ]);
  });

  it("looks for claude on the PATH of POSIX, then in the install folders", () => {
    expect(claudeCandidates("linux", { PATH: "/usr/bin:/opt/bin", HOME: "/home/example" })).toEqual([
      "/usr/bin/claude",
      "/opt/bin/claude",
      "/home/example/.local/bin/claude",
      "/home/example/.claude/local/claude",
    ]);
    expect(claudeCandidates("darwin", {})).toEqual([]);
  });
});

describe("findClaude", () => {
  it("uses the executable option, then CLAUDE_BIN", () => {
    expect(findClaude({ executable: "/opt/claude", env: { [CLAUDE_ENV]: "/other" }, exists: none })).toBe("/opt/claude");
    expect(findClaude({ env: { [CLAUDE_ENV]: "/other" }, exists: none })).toBe("/other");
  });

  it("gives the first candidate that exists, or undefined", () => {
    const env = { PATH: "/usr/bin:/opt/bin", HOME: "/home/example" };
    expect(findClaude({ env, platform: "linux", exists: (path) => path === "/home/example/.local/bin/claude" })).toBe("/home/example/.local/bin/claude");
    expect(findClaude({ env: { ...env, [CLAUDE_ENV]: "" }, platform: "linux", exists: none })).toBeUndefined();
  });
});
