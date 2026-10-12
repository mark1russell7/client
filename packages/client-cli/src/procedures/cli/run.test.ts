/**
 * cli.run gives mark an argv that mark reads back as the same input (docs review of 2026-10-08).
 */

import { describe, it, expect } from "vitest";
import { buildMarkArgs } from "./run.js";

describe("buildMarkArgs", () => {
  it("keeps a value that starts with '-' as a value", () => {
    expect(buildMarkArgs({ path: ["fs", "exists"], args: { path: "-weird" } })).toEqual(["fs", "exists", "--path=-weird"]);
  });

  it("sends a false boolean, so a default of true can be turned off", () => {
    expect(buildMarkArgs({ path: ["git", "status"], args: { short: false, verbose: true } })).toEqual([
      "git",
      "status",
      "--short=false",
      "--verbose=true",
    ]);
  });

  it("sends numbers as JSON and puts positional arguments after --", () => {
    expect(buildMarkArgs({ path: ["git", "log"], args: { count: 3 }, positional: ["-x", "y"] })).toEqual([
      "git",
      "log",
      "--count=3",
      "--",
      "-x",
      "y",
    ]);
  });

  it("gives only the path when there is no input", () => {
    expect(buildMarkArgs({ path: ["lib", "scan"] })).toEqual(["lib", "scan"]);
  });
});
