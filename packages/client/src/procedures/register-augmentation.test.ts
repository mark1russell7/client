/**
 * An application gives its clearance and resource types to the framework by augmenting
 * `Register` through the package name (CAPABILITIES-2026-10, decision 5). The interface is
 * declared in `procedures/types.ts` and only re-exported by the root, so this test compiles an
 * application file against the built package: the augmentation must reach `ctx.capability` and
 * `ctx.resources`. The file is in a temporary folder of this package, so no other compilation
 * sees the augmentation.
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// The exports map of TypeScript 7 does not export its bin: the file of the package folder
const tsc = join(realpathSync(join(packageDir, "node_modules", "typescript")), "bin", "tsc");

const APPLICATION = `import { defineProcedure, outputSchema, type ProcedureContext } from "@procedures/client";

interface World { entities(): string[] }

declare module "@procedures/client" {
  interface Register {
    clearance: "public" | "shared" | "private";
    resources: { world: World };
  }
}

export const listEntities = defineProcedure({
  path: ["entity", "list"],
  input: outputSchema<Record<string, never>>(),
  output: outputSchema<string[]>(),
  handler: (_input: Record<string, never>, ctx: ProcedureContext) => {
    const level: "public" | "shared" | "private" | undefined = ctx.capability.clearance;
    // @ts-expect-error: a value that the application did not declare
    const wrong: "secret" | undefined = ctx.capability.clearance;
    void level;
    void wrong;
    return ctx.resources.world.entities();
  },
});
`;

describe("the Register augmentation", () => {
  it("gives the types of the application to ctx.capability and ctx.resources", () => {
    const dir = mkdtempSync(join(packageDir, ".register-check-"));
    try {
      writeFileSync(join(dir, "application.ts"), APPLICATION);
      writeFileSync(
        join(dir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { strict: true, module: "nodenext", moduleResolution: "nodenext", target: "esnext", noEmit: true, skipLibCheck: true },
          files: ["application.ts"],
        })
      );
      const result = spawnSync(process.execPath, [tsc, "-p", dir], { encoding: "utf8" });
      expect(`${result.stdout}${result.stderr}`).toBe("");
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
