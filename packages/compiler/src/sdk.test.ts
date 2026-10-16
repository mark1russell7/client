/**
 * The OpenRPC document and the typed TypeScript SDK of a manifest (roadmap R23).
 *
 * The golden files are in test/golden: `openrpc.json` and `sdk.ts`, from the manifest of a small
 * registry of test procedures. To accept an intended change, start `npx vitest run -u` in this
 * package and review the diff. The test of the test types (`.github/scripts/typecheck-tests.mjs`)
 * examines `sdk.ts` with the strict configuration of the package. A second test writes the SDK of
 * the core procedures to a temporary folder and type-checks it with the TypeScript of the package.
 */

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  ProcedureRegistry,
  allCoreProcedures,
  anySchema,
  defineProcedure,
  describeRegistry,
  metaProcedures,
  zodAdapter,
  type AnyProcedure,
  type ProcedureContext,
  type ProcedureSchema,
} from "@procedures/client/browser";
import { schemaToType, toTypeScriptSdk } from "./typescript-sdk.js";
import { OPENRPC_VERSION, toOpenRpc } from "./openrpc.js";
import { compilerModule } from "./module.js";
import { makeHarness } from "../test/harness.js";
import type { SdkOpenrpcOutput, SdkTypescriptOutput } from "./types.js";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function procedure(path: string[], input: ProcedureSchema, output: ProcedureSchema, metadata: Record<string, unknown>): AnyProcedure {
  return defineProcedure({ path, input, output, metadata, handler: async () => undefined }) as AnyProcedure;
}

/** A small registry: objects, optional and quoted names, enums, unions, records, a namespace that is also a procedure. */
function testRegistry(): ProcedureRegistry {
  const registry = new ProcedureRegistry();
  const procedures = [
    procedure(
      ["files", "read"],
      zodAdapter(z.object({ path: z.string().describe("The path of the file"), encoding: z.enum(["utf8", "base64"]).optional().describe("The encoding of the content") })),
      zodAdapter(z.object({ content: z.string(), size: z.number().int().describe("The size in bytes") })),
      { description: "Read a file", tags: ["fs"], effects: { reads: ["fs"], writes: [] } },
    ),
    procedure(
      ["files", "write"],
      zodAdapter(z.object({ path: z.string(), content: z.string(), "mode-bits": z.number().int().optional(), "2fa": z.boolean().optional() })),
      zodAdapter(z.object({ written: z.literal(true) })),
      { description: "Write a file. A comment end */ in a description stays in the comment.", effects: { reads: [], writes: ["fs"], destructive: true } },
    ),
    procedure(["math", "add"], zodAdapter(z.object({ a: z.number(), b: z.number() })), zodAdapter(z.number()), { description: "Add two numbers", effects: { reads: [], writes: [] } }),
    procedure(
      ["jobs", "list"],
      zodAdapter(z.object({ state: z.enum(["queued", "done"]).optional() })),
      zodAdapter(z.array(z.object({ id: z.string(), state: z.union([z.literal("queued"), z.literal("done")]).nullable() }))),
      { description: "List the jobs" },
    ),
    procedure(["jobs", "list", "count"], zodAdapter(z.object({})), zodAdapter(z.object({ count: z.number().int() })), { description: "Count the jobs" }),
    procedure(["config", "get"], zodAdapter(z.object({ key: z.string() })), zodAdapter(z.record(z.string(), z.string())), {}),
    procedure(["misc", "any"], anySchema, anySchema, { deprecated: true }),
  ];
  for (const entry of procedures) registry.register(entry);
  return registry;
}

describe("schemaToType", () => {
  it("writes objects with required and optional properties, and quotes the names that are not identifiers", () => {
    const type = schemaToType({
      type: "object",
      properties: { a: { type: "string", description: "The a" }, "b-c": { type: "integer" }, d: { type: "array", items: { type: "boolean" } } },
      required: ["a"],
    });
    expect(type).toBe(['{', "  /** The a */", "  a: string;", '  "b-c"?: number | undefined;', "  d?: Array<boolean> | undefined;", "}"].join("\n"));
  });

  it("writes enum, const, anyOf, oneOf, type lists and null as unions", () => {
    expect(schemaToType({ enum: ["x", 1, true, null] })).toBe('"x" | 1 | true | null');
    expect(schemaToType({ const: "fixed" })).toBe('"fixed"');
    expect(schemaToType({ anyOf: [{ type: "string" }, { type: "null" }] })).toBe("string | null");
    expect(schemaToType({ oneOf: [{ type: "number" }, { type: "string" }] })).toBe("number | string");
    expect(schemaToType({ type: ["string", "null"] })).toBe("string | null");
  });

  it("writes additionalProperties as an index signature", () => {
    expect(schemaToType({ type: "object", additionalProperties: { type: "string" } })).toBe("{\n  [key: string]: string;\n}");
    expect(schemaToType({ type: "object", properties: { a: { type: "number" } }, required: ["a"], additionalProperties: {} })).toBe(
      "{\n  a: number;\n  [key: string]: unknown;\n}",
    );
    // An index signature must agree with each property, so a typed index with properties becomes unknown
    expect(schemaToType({ type: "object", properties: { a: { type: "number" } }, additionalProperties: { type: "string" } })).toContain("[key: string]: unknown;");
    expect(schemaToType({ type: "object", properties: {}, additionalProperties: false })).toBe("Record<string, never>");
    expect(schemaToType({ type: "object" })).toBe("{\n  [key: string]: unknown;\n}");
  });

  it("writes unknown for each other schema", () => {
    for (const schema of [undefined, true, {}, { $ref: "#/definitions/x" }, { allOf: [{ type: "string" }] }, { not: {} }, { type: "array", items: [{ type: "string" }] }, { const: { a: 1 } }]) {
      expect(schemaToType(schema)).toMatch(/^(unknown|Array<unknown>)$/);
    }
    expect(schemaToType(false)).toBe("never");
  });
});

describe("toOpenRpc", () => {
  it("gives one method for each procedure, as a deterministic JSON document (golden)", async () => {
    const manifest = describeRegistry(testRegistry());
    const document = toOpenRpc(manifest);
    const text = `${JSON.stringify(document, null, 2)}\n`;
    await expect(text).toMatchFileSnapshot("../test/golden/openrpc.json");
    // The document is JSON: the text gives the same document back, and a second call gives the same text
    expect(JSON.parse(text)).toEqual(document);
    expect(`${JSON.stringify(toOpenRpc(describeRegistry(testRegistry())), null, 2)}\n`).toBe(text);
    expect(document.openrpc).toBe(OPENRPC_VERSION);
    expect(document.info).toEqual({ title: "Procedures", version: manifest.hash });
    expect(document.methods.map((method) => method.name)).toEqual(["config.get", "files.read", "files.write", "jobs.list", "jobs.list.count", "math.add", "misc.any"]);
    for (const method of document.methods) {
      expect(method.params).toHaveLength(1);
      expect(method.params[0]).toMatchObject({ name: "input", required: true });
      expect(method.result.name).toBe("output");
      expect(typeof method.result.schema).toBe("object");
    }
    expect(document.methods.find((method) => method.name === "files.write")!["x-effects"]).toEqual({ reads: [], writes: ["fs"], destructive: true });
    expect(document.methods.find((method) => method.name === "jobs.list")!["x-effects"]).toBeUndefined();
    expect(document.methods.find((method) => method.name === "misc.any")!.deprecated).toBe(true);
  });

  it("takes the title, the version and the description from the options", () => {
    const document = toOpenRpc(describeRegistry(testRegistry()), { title: "Jobs", version: "1.0.0", description: "The jobs of a host" });
    expect(document.info).toEqual({ title: "Jobs", version: "1.0.0", description: "The jobs of a host" });
  });
});

describe("toTypeScriptSdk", () => {
  it("writes the types and the methods of each procedure (golden), and the methods call the client", async () => {
    const code = toTypeScriptSdk(describeRegistry(testRegistry()));
    await expect(code).toMatchFileSnapshot("../test/golden/sdk.ts");
    expect(code).toContain("export type FilesReadInput = {");
    expect(code).toContain('  "mode-bits"?: number | undefined;');
    expect(code).toContain("export type JobsListOutput = Array<{");
    expect(code).toContain('state: "queued" | "done" | null;');
    expect(code).toContain("export type ConfigGetOutput = {\n  [key: string]: string;\n};");
    expect(code).toContain("Write a file. A comment end *\\/ in a description stays in the comment.");

    const { createSdk } = await import("../test/golden/sdk.js");
    const calls: Array<[string[], unknown]> = [];
    const sdk = createSdk({
      call: async (path, input) => {
        calls.push([path, input]);
        return path.join(".");
      },
    });
    expect(await sdk.math.add({ a: 1, b: 2 })).toBe("math.add");
    await sdk.jobs.list();
    await sdk.jobs.list.count();
    await sdk.files.write({ path: "p", content: "c", "mode-bits": 420 });
    expect(calls).toEqual([
      [["math", "add"], { a: 1, b: 2 }],
      [["jobs", "list"], {}],
      [["jobs", "list", "count"], {}],
      [["files", "write"], { path: "p", content: "c", "mode-bits": 420 }],
    ]);
  });

  it("writes an SDK without methods for an empty manifest, with no unused name", () => {
    const code = toTypeScriptSdk({ format: "procedures.manifest/1", hash: "0000000000000000", procedures: [] });
    expect(code).toContain("export interface Sdk {\n}");
    expect(code).toContain("export function createSdk(_client: SdkClient): Sdk {\n  return {};\n}");
    expect(code).not.toContain("const call");
    expect(code).not.toContain("withMembers");
  });

  it("writes an SDK of the core procedures that type-checks with the strict options of the package", () => {
    const registry = new ProcedureRegistry();
    for (const entry of [...allCoreProcedures, ...metaProcedures, ...(compilerModule.procedures as AnyProcedure[])]) registry.register(entry);
    const code = toTypeScriptSdk(describeRegistry(registry));
    expect(code).toContain("readonly chain: (input: ClientChainInput) => Promise<ClientChainOutput>;");

    // The TypeScript of the package, as .github/scripts/typecheck-tests.mjs finds it
    const manifestPath = createRequire(join(packageDir, "package.json")).resolve("typescript/package.json");
    const typescript = JSON.parse(readFileSync(manifestPath, "utf8")) as { bin: string | Record<string, string> };
    const tsc = join(dirname(manifestPath), typeof typescript.bin === "string" ? typescript.bin : typescript.bin["tsc"]!);
    const dir = mkdtempSync(join(tmpdir(), "procedures-sdk-"));
    try {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
      writeFileSync(join(dir, "sdk.ts"), code);
      writeFileSync(
        join(dir, "use.ts"),
        [
          'import { createSdk, type SdkClient } from "./sdk.js";',
          "",
          "const client: SdkClient = { call: async (_path, input) => input };",
          "const sdk = createSdk(client);",
          "export const identity: Promise<unknown> = sdk.client.identity({ value: 1 });",
          "export const manifest: Promise<unknown> = sdk.procedure.manifest();",
          'export const checked: Promise<{ ok: boolean }> = sdk.program.check({ program: { $proc: ["client", "identity"] } });',
          "",
        ].join("\n"),
      );
      writeFileSync(
        join(dir, "tsconfig.json"),
        JSON.stringify({
          extends: join(packageDir, "tsconfig.json").replace(/\\/g, "/"),
          compilerOptions: { noEmit: true, composite: false, incremental: false, rootDir: "${configDir}" },
          include: ["${configDir}/*.ts"],
          exclude: [],
        }),
      );
      const result = spawnSync(process.execPath, [tsc, "-p", join(dir, "tsconfig.json"), "--pretty", "false"], { cwd: dir, encoding: "utf8", timeout: 120_000 });
      expect(`${result.stdout}${result.stderr}`.trim()).toBe("");
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});

describe("sdk.openrpc and sdk.typescript", () => {
  it("describe the registry of the caller, one namespace on request", async () => {
    const harness = makeHarness(compilerModule.procedures as AnyProcedure[]);
    const document = await harness.client.exec<SdkOpenrpcOutput>({ $proc: ["sdk", "openrpc"], input: { namespace: "t" } });
    expect(document.methods.map((method) => method["name"])).toEqual(["t.add", "t.echo", "t.fail", "t.num", "t.read", "t.truth", "t.write"]);
    expect(document.methods.find((method) => method["name"] === "t.write")!["x-effects"]).toEqual({ reads: [], writes: ["store"], destructive: true, idempotent: false });
    const sdk = await harness.client.exec<SdkTypescriptOutput>({ $proc: ["sdk", "typescript"], input: { namespace: "program" } });
    expect(sdk.procedures).toBe(4);
    expect(sdk.code).toContain("readonly explain: (input: ProgramExplainInput) => Promise<ProgramExplainOutput>;");
    expect(sdk.registryHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("obey the expose rule of the host", async () => {
    const harness = makeHarness(compilerModule.procedures as AnyProcedure[]);
    const { sdkOpenrpc } = await import("./procedures/sdk/openrpc.js");
    const context = { registry: harness.registry, expose: (path: string[]) => path[0] === "t" && path[1] !== "write", metadata: {}, path: ["sdk", "openrpc"] };
    const document = await sdkOpenrpc({}, context as unknown as ProcedureContext);
    expect(document.methods.map((method) => method["name"])).toEqual(["t.add", "t.echo", "t.fail", "t.num", "t.read", "t.truth"]);
  });
});
