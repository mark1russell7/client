/**
 * The builders of the playground give the procedure references that `client.exec` runs.
 */

import { describe, expect, it } from "vitest";
import { proc, ref } from "./index.js";

describe("ref", () => {
  it("gives an output reference to a named stage", () => {
    expect(ref("changes.value")).toEqual({ $ref: "changes.value" });
  });
});

describe("proc", () => {
  it("gives the path and an empty input when the builder sets nothing", () => {
    const built = proc(["git", "status"]).ref;
    expect(built).toEqual({ $proc: ["git", "status"], input: {} });
    expect(built).not.toHaveProperty("$name");
    expect(built).not.toHaveProperty("$when");
  });

  it("gives the input, the name and the time of execution that the builder sets", () => {
    const built = proc(["git", "add"]).input({ all: true }).name("stage").when("$parent").ref;
    expect(built).toEqual({ $proc: ["git", "add"], input: { all: true }, $name: "stage", $when: "$parent" });
  });

  it("puts references in the input of another procedure", () => {
    const changes = proc(["git", "hasChanges"]).name("changes").ref;
    const outer = proc(["client", "conditional"]).input({ condition: ref("changes.value"), then: changes }).ref;
    expect(outer.input).toEqual({ condition: { $ref: "changes.value" }, then: { $proc: ["git", "hasChanges"], input: {}, $name: "changes" } });
  });
});
