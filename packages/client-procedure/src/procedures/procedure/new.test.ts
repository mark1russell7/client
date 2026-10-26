/**
 * procedure.new puts the procedure into the list that defineModule gets: an array literal, a
 * variable of this file, or a spread of such a variable. Before, it put the procedure into the
 * first array after the call, also into `registerModules(registry, [...])` (the ics and geo
 * packages). A list that it cannot find is an error, and nothing is written.
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";
import type { ProcedureContext } from "@procedures/client";
import { addToRegistration, ensureNamedImports, procedureLayout, procedureNew, registerSource } from "./new.js";

const HEADER = `import { defineModule, registerModules, PROCEDURE_REGISTRY, type AnyProcedure, type ProcedureModule, type ProcedureRegistry } from "@procedures/client";
import { shellModule } from "@procedures/shell/module";
import { aProcedure } from "./procedures/a.js";
`;

const REGISTER_FUNCTION = `
export function registerDemoProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [demoModule]);
}
`;

/** The module of a package of `lib new`: the list is an array literal */
const LITERAL = `${HEADER}
export const demoModule: ProcedureModule = defineModule("@procedures/demo", [aProcedure], [shellModule]);
${REGISTER_FUNCTION}`;

/** The list is a variable that the module declares */
const VARIABLE = `${HEADER}
/** The procedures of the package */
const demoProcedures: AnyProcedure[] = [
  // The user's first procedure
  aProcedure,
];

export const demoModule: ProcedureModule = defineModule("@procedures/demo", demoProcedures, [shellModule]);
${REGISTER_FUNCTION}`;

/** The list is a spread of a variable that the module declares (client-mongo, client-server) */
const SPREAD = `${HEADER}
/**
 * All procedures
 */
export const procedures: readonly AnyProcedure[] = [aProcedure];

export const demoModule: ProcedureModule = defineModule("@procedures/demo", [...procedures]);
${REGISTER_FUNCTION}`;

/** The list comes from another file (the ics and geo packages) */
const IMPORTED = `${HEADER}import { demoProcedures } from "./procedures.js";

export const demoModule: ProcedureModule = defineModule("@procedures/demo", demoProcedures);
${REGISTER_FUNCTION}`;

/** Gives the source of a successful edit, and fails the test otherwise */
function edited(source: string): { source: string; before: number } {
  const result = addToRegistration(source, "bProcedure");
  if ("error" in result) throw new Error(result.error);
  return result;
}

describe("addToRegistration", () => {
  it("adds the item to an array literal, and not to the requires or to registerModules", () => {
    const { source, before } = edited(LITERAL);
    expect(source).toContain('defineModule("@procedures/demo", [aProcedure, bProcedure], [shellModule])');
    expect(source).toContain("registerModules(registry, [demoModule]);");
    expect(source.slice(before)).toMatch(/^export const demoModule/);
  });

  it("follows a variable to its array in the same file", () => {
    const { source, before } = edited(VARIABLE);
    expect(source).toContain("  // The user's first procedure\n  aProcedure,\n  bProcedure,\n];");
    expect(source).toContain('defineModule("@procedures/demo", demoProcedures, [shellModule])');
    expect(source).toContain("registerModules(registry, [demoModule]);");
    // The definition goes before the declaration and its doc comment
    expect(source.slice(before)).toMatch(/^\/\*\* The procedures of the package \*\/\nconst demoProcedures/);
  });

  it("follows a spread of a variable to its array in the same file", () => {
    const { source, before } = edited(SPREAD);
    expect(source).toContain("export const procedures: readonly AnyProcedure[] = [aProcedure, bProcedure];");
    expect(source).toContain('defineModule("@procedures/demo", [...procedures])');
    expect(source).toContain("registerModules(registry, [demoModule]);");
    expect(source.slice(before)).toMatch(/^\/\*\*\n \* All procedures\n \*\/\nexport const procedures/);
  });

  it("adds the item to the literal when the spread variable is not in the file", () => {
    const source = IMPORTED.replace("defineModule(\"@procedures/demo\", demoProcedures)", "defineModule(\"@procedures/demo\", [...demoProcedures])");
    expect(edited(source).source).toContain('defineModule("@procedures/demo", [...demoProcedures, bProcedure])');
  });

  it("gives an error for a variable of another file, and does not use registerModules", () => {
    const result = addToRegistration(IMPORTED, "bProcedure");
    expect(result).toEqual({ error: 'defineModule gets "demoProcedures", and this file does not declare "demoProcedures" as an array' });
  });

  it("gives an error for a list that a function makes", () => {
    const source = LITERAL.replace("[aProcedure], [shellModule]", "demoProcedures(DEFAULT_SETTINGS)");
    expect(addToRegistration(source, "bProcedure")).toEqual({
      error: 'defineModule gets "demoProcedures(DEFAULT_SETTINGS)", which is not an array or a variable of this file',
    });
  });

  it("gives an error for a file without a call, and skips the calls in comments and strings", () => {
    const source = `/** defineModule("x", [a]) */\n// registerProcedures([a])\nconst text = "registerAll([a])";\n`;
    expect(addToRegistration(source, "bProcedure")).toEqual({ error: "the file has no defineModule, registerProcedures or registerAll call" });
  });

  it("keeps the first argument of registerProcedures", () => {
    const source = `export function register(): void {\n  registerProcedures([\n    aProcedure,\n  ]);\n}\n`;
    const { source: updated, before } = edited(source);
    expect(updated).toContain("registerProcedures([\n    aProcedure,\n    bProcedure,\n  ]);");
    expect(before).toBe(0);
  });

  it("follows a variable whose name has a dollar sign", () => {
    const source = `const $procedures = [aProcedure];\nexport const demoModule = defineModule("@procedures/demo", $procedures);\n`;
    expect(edited(source).source).toContain("const $procedures = [aProcedure, bProcedure];");
  });
});

describe("ensureNamedImports", () => {
  it("adds only the names that the import does not have, also with type and as", () => {
    const source = `import { a as b, type c } from "m";\n`;
    expect(ensureNamedImports(source, "m", ["a", "c", "d"])).toBe(`import { a as b, type c, d } from "m";\n`);
    expect(ensureNamedImports(source, "m", ["a", "c"])).toBe(source);
  });

  it("reads a long run of spaces in an import in linear time", () => {
    const source = `import { a${" ".repeat(50_000)}x } from "m";\n`;
    const started = performance.now();
    expect(ensureNamedImports(source, "m", ["z"])).toContain(", z } from \"m\";");
    expect(performance.now() - started).toBeLessThan(100);
  });
});

describe("registerSource", () => {
  it("puts the definition before the variable that uses it, and adds the imports", () => {
    const updated = registerSource(VARIABLE, procedureLayout("demo.hello"), "Say hello", "./procedures/demo/hello.js");
    if (typeof updated !== "string") throw new Error(updated.error);
    const definition = updated.indexOf("const demoHelloProcedure = createProcedure()");
    expect(definition).toBeGreaterThan(updated.indexOf('import { demoHello } from "./procedures/demo/hello.js";'));
    expect(definition).toBeLessThan(updated.indexOf("const demoProcedures: AnyProcedure[]"));
    expect(updated).toContain("  aProcedure,\n  demoHelloProcedure,\n];");
    expect(updated).toMatch(/import \{ [^}]*createProcedure \} from "@procedures\/client";/);
    // The template gives the schemas to input() and output() directly: no adapter, no cast
    expect(updated).toContain(".input(DemoHelloInputSchema)");
    expect(updated).not.toContain("zodAdapter");
    expect(updated).not.toContain("as AnyProcedure");
  });
});

/** A context whose client serves fs.* from a map of files, and records the writes */
function memoryContext(files: Map<string, string>): { ctx: ProcedureContext; writes: string[] } {
  const writes: string[] = [];
  const handlers: Record<string, (input: { path: string; content?: string }) => unknown> = {
    "fs.exists": ({ path }) => ({ path, exists: files.has(path) || [...files.keys()].some((file) => file.startsWith(path + "/") || file.startsWith(path + "\\")) }),
    "fs.read": ({ path }) => ({ path, content: files.get(path) }),
    "fs.write": ({ path, content }) => {
      writes.push(path);
      files.set(path, content!);
      return { path, bytesWritten: content!.length };
    },
    "fs.mkdir": ({ path }) => {
      writes.push(path);
      return { path, created: true };
    },
  };
  const ctx = {
    client: {
      call: async (path: string[], input: { path: string; content?: string }) => {
        const handler = handlers[path.join(".")];
        if (!handler) throw new Error(`Unexpected procedure call: ${path.join(".")}`);
        return handler(input);
      },
    },
  } as unknown as ProcedureContext;
  return { ctx, writes };
}

describe("procedure.new", () => {
  const root = join("pkg");
  const moduleFile = join(root, "src", "module.ts");

  it("writes nothing when it cannot find the list of the module (the ics and geo packages)", async () => {
    for (const dryRun of [false, true]) {
      const files = new Map([[moduleFile, IMPORTED]]);
      const { ctx, writes } = memoryContext(files);
      const result = await procedureNew({ name: "demo.hello", path: root, dryRun }, ctx);
      expect(result.success).toBe(false);
      expect(result.errors).toEqual([
        `${moduleFile} has no list of procedures that procedure.new can change: defineModule gets "demoProcedures", and this file does not declare "demoProcedures" as an array. ` +
          "Nothing was written. Give the module an array of procedures in module.ts, and start procedure.new again.",
      ]);
      expect(writes).toEqual([]);
      expect(files.get(moduleFile)).toBe(IMPORTED);
    }
  });

  it("registers the procedure in the array of the variable", async () => {
    const files = new Map([[moduleFile, VARIABLE]]);
    const { ctx } = memoryContext(files);
    const result = await procedureNew({ name: "demo.hello", path: root, dryRun: false }, ctx);
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.modified).toContain(moduleFile);
    const module = files.get(moduleFile)!;
    expect(module).toContain("  aProcedure,\n  demoHelloProcedure,\n];");
    expect(module).toContain("registerModules(registry, [demoModule]);");
    expect(files.get(join(root, "src", "procedures", "demo", "hello.ts"))).toContain("export async function demoHello(");
  });

  it("writes no effects, and tells the author to write them", async () => {
    const files = new Map([[moduleFile, VARIABLE]]);
    const { ctx } = memoryContext(files);
    const result = await procedureNew({ name: "demo.hello", path: root, dryRun: false }, ctx);
    expect(result.success).toBe(true);
    expect(files.get(moduleFile)).not.toContain("effects");
    expect(result.operations.at(-1)).toBe("Write metadata.effects: lib audit reports a procedure without them");
  });
});
