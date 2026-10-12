import { describe, it, expect } from "vitest";
import { exposeRule } from "./expose.js";

describe("exposeRule", () => {
  it("matches exact keys and prefixes, and nothing else", () => {
    const rule = exposeRule(["git.status", "mongo.*"]);
    expect(rule(["git", "status"])).toBe(true);
    expect(rule(["git", "commit"])).toBe(false);
    expect(rule(["mongo", "documents", "find"])).toBe(true);
    expect(rule(["mongodb", "x"])).toBe(false);
    expect(rule(["shell", "exec"])).toBe(false);
  });

  it("matches every procedure for *", () => {
    expect(exposeRule(["*"])(["shell", "exec"])).toBe(true);
  });
});
