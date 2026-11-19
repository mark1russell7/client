/**
 * The module files of `MCP_BUNDLES` (d40-tool-surface, step 1): a file outside this package gives
 * its module and its tools to the host. The probe file imports nothing. A procedure is data, so
 * the probe stands for the module of another copy of `@procedures/client`, for example the tools
 * of another repository.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { mergeInstructions, procedureToMcpTool } from "@procedures/mcp-server";
import type { McpServerConfig } from "./config.js";
import { createDevToolsHost, isModuleFile, loadBundles, loadModuleFile, moduleFileUrl, type DevToolsHost } from "./host.js";

/** A module with no imports: Standard Schema validators, a tool `probe.echo`, and a module `probehelper` in its `requires`. */
const PROBE = `
const any = { "~standard": { version: 1, vendor: "probe", validate: (value) => ({ value }) } };
const text = { "~standard": { version: 1, vendor: "probe", validate: (value) => (typeof value === "string" ? { value } : { issues: [{ message: "a text" }] }) } };
const pure = { reads: [], writes: [] };
const helper = {
  name: "probe-helper",
  procedures: [{ path: ["probehelper", "run"], input: any, output: text, metadata: { description: "This procedure gives a text.", effects: pure }, handler: () => "helper" }],
};
export default {
  name: "probe",
  requires: [helper],
  procedures: [
    { path: ["probe", "echo"], input: any, output: text, metadata: { description: "This procedure gives its input as JSON text.", effects: pure }, handler: (input) => JSON.stringify(input) },
  ],
};
`;

const config: McpServerConfig = { bundles: [], serverName: "test", serverVersion: "0", debug: false, toolTimeoutMs: 0 };

let folder: string;
let probe: string;
let host: DevToolsHost;

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), "mcp-module-file-"));
  probe = join(folder, "probe.mjs");
  writeFileSync(probe, PROBE);
  writeFileSync(join(folder, "named.mjs"), `${PROBE}\nexport const mcpNamespaces = ["probehelper"];\n`);
  writeFileSync(join(folder, "no-default.mjs"), "export const tools = [];\n");
  writeFileSync(join(folder, "throws.mjs"), 'throw new Error("the probe stops");\n');
  writeFileSync(join(folder, "instructed.mjs"), `${PROBE}\nexport const mcpInstructions = "Read probe.echo first.";\n`);
  const two = PROBE.replace('name: "probe",', 'name: "probe-two",').replace('["probe", "echo"]', '["probetwo", "echo"]');
  writeFileSync(join(folder, "two.mjs"), `${two}\nexport const mcpInstructions = "  probetwo.echo gives JSON text.  ";\n`);
  host = await createDevToolsHost({ ...config, bundles: ["@procedures/bundle-mcp", probe] });
});

afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe("an entry of MCP_BUNDLES", () => {
  it("is a module file when it is a file URL, an absolute path or a relative path", () => {
    expect(isModuleFile(pathToFileURL(join(tmpdir(), "tools.mjs")).href)).toBe(true);
    expect(isModuleFile(join(tmpdir(), "tools.mjs"))).toBe(true);
    expect(isModuleFile("./tools.mjs")).toBe(true);
    expect(isModuleFile("../tools/module.ts")).toBe(true);
    expect(isModuleFile("@procedures/bundle-mcp")).toBe(false);
    expect(isModuleFile("bundle-local")).toBe(false);
  });

  it("gives a relative path from the folder of the process", () => {
    expect(moduleFileUrl("./probe.mjs", folder)).toBe(pathToFileURL(probe).href);
    expect(moduleFileUrl(pathToFileURL(probe).href, tmpdir())).toBe(pathToFileURL(probe).href);
  });
});

describe("a module file", () => {
  it("gives the namespaces of its own procedures as its tools, and not those of the modules that it requires", async () => {
    expect((await loadModuleFile(probe)).mcpNamespaces).toEqual(["probe"]);
    expect((await loadModuleFile("./named.mjs", folder)).mcpNamespaces).toEqual(["probehelper"]);
  });

  it("stops the host when it does not load or has no module, and names the file", async () => {
    await expect(loadModuleFile("./throws.mjs", folder)).rejects.toThrow(/module file \.\/throws\.mjs did not load: the probe stops/);
    await expect(loadModuleFile("./no-default.mjs", folder)).rejects.toThrow(/module file \.\/no-default\.mjs has no default export/);
    await expect(loadModuleFile("./missing.mjs", folder)).rejects.toThrow(/module file \.\/missing\.mjs did not load/);
  });

  it("needs the module entries of the bundles: with a bundle that has none, the host stops", async () => {
    await expect(loadBundles(["@procedures/no-such-bundle", probe])).rejects.toThrow(/needs the module entry of each bundle/);
  });
});

describe("the host with a module file next to a bundle", () => {
  it("adds the namespaces of the file to the tools of the bundle, and keeps the hidden procedures hidden", () => {
    expect(host.surface?.namespaces).toContain("probe");
    expect(host.surface?.namespaces).toContain("docker");
    expect(host.policy.expose!(["probe", "echo"])).toBe(true);
    expect(host.policy.expose!(["probehelper", "run"])).toBe(false);
    expect(host.policy.expose!(["shell", "exec"])).toBe(false);
    expect(host.registry.get(["probehelper", "run"])).toBeDefined();
  });

  it("lists the procedure of the file as a tool with its description and its effects", () => {
    const tool = procedureToMcpTool(host.registry.get(["probe", "echo"])!);
    expect(tool.description).toContain("This procedure gives its input as JSON text.");
    expect(tool.annotations).toMatchObject({ readOnlyHint: true });
  });

  it("calls the procedure of the file through the server, with the validators of the file", async () => {
    const response = await host.server.handle({ id: "probe", method: { service: "probe", operation: "echo" }, payload: { a: 1 }, metadata: {} });
    expect(response.status).toMatchObject({ type: "success" });
    expect(response.payload).toBe('{"a":1}');
  });
});

describe("the instructions of the bundles", () => {
  it("joins the texts in their order with a blank line, once each, and gives undefined without a text", () => {
    expect(mergeInstructions([{ mcpInstructions: "A." }, {}, { mcpInstructions: " B. " }, { mcpInstructions: "A." }, { mcpInstructions: "  " }])).toBe("A.\n\nB.");
    expect(mergeInstructions([{ mcpNamespaces: ["docker"] }, {}])).toBeUndefined();
  });

  it("gives the server the instructions of its module files, and no instructions when no bundle has them", async () => {
    const instructed = await createDevToolsHost({ ...config, bundles: ["@procedures/bundle-mcp", join(folder, "instructed.mjs"), join(folder, "two.mjs")] });
    expect(instructed.instructions).toBe("Read probe.echo first.\n\nprobetwo.echo gives JSON text.");
    expect(host.instructions).toBeUndefined();
  });
});
