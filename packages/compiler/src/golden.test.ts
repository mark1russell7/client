/**
 * The golden outputs: the IR and the source text (TypeScript) of representative programs. The
 * files are in test/golden. The test of the test types (`.github/scripts/typecheck-tests.mjs`)
 * examines the TypeScript files with the strict configuration of the package.
 */

import { describe, expect, it } from "vitest";
import { makeHarness } from "../test/harness.js";
import { GOLDEN_PROGRAMS } from "../test/golden-programs.js";
import { printIR } from "./print.js";

describe("golden outputs", () => {
  for (const { name, program, mode } of GOLDEN_PROGRAMS) {
    it(`${name}: the IR, the TypeScript text and the run agree`, async () => {
      const harness = makeHarness();
      const compiled = await harness.compile(program, { mode, language: "ts" });
      expect(compiled.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
      await expect(printIR(compiled.ir)).toMatchFileSnapshot(`../test/golden/${name}.ir.txt`);
      // The hash changes with each change of a core procedure: the golden file does not pin it
      await expect(compiled.code.split(compiled.registryHash).join("<registry hash>")).toMatchFileSnapshot(`../test/golden/${name}.ts`);
      const input = mode === "body" ? { x: 41 } : undefined;
      const closure = await harness.runCompiled(compiled.run, input);
      expect(await harness.runText(compiled.body, input)).toEqual(closure);
      if (mode !== "body") expect(closure).toEqual(await harness.interpret(program));
    });
  }
});
