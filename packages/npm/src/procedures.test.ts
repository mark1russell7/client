/**
 * The npm procedures (roadmap R43) through a registry of the module with a fake shell: the
 * argument list of each procedure, the guards, the confirmation of the writes, the parsed outputs
 * and the declared effects. No call reaches a registry.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, outputValue, type Effects, type ProcedureContext, type ProcedurePath } from "@procedures/client";
import { fakeShell as sharedFakeShell } from "@procedures/shell/testing";
import { npmModule, registerNpmProcedures } from "./module.js";
import { npmDeprecate } from "./procedures/npm/deprecate.js";
import { npmDistTagsAdd } from "./procedures/npm/distTags/add.js";
import { npmDistTagsRemove } from "./procedures/npm/distTags/remove.js";
import { parseJson, resolveNpm } from "./procedures/npm/shared.js";
import { parseDistTags } from "./procedures/npm/distTags/list.js";
import type { NpmDistTagsListOutput, NpmJsonOutput, NpmWhoamiOutput } from "./types.js";

type ProcedureClient = ProcedureContext["client"];

const registry = createRegistry(npmModule);
const savedExecPath = process.env["npm_execpath"];

afterEach(() => {
  if (savedExecPath === undefined) delete process.env["npm_execpath"];
  else process.env["npm_execpath"] = savedExecPath;
});

/** A fake shell: shell.run gives `result` and records its input. npm resolves to a fake script. */
function fakeShell(result: { exitCode: number; stdout?: string; stderr?: string } = { exitCode: 0 }) {
  const script = join(mkdtempSync(join(tmpdir(), "npm-")), "npm-cli.js");
  writeFileSync(script, "");
  process.env["npm_execpath"] = script;
  const shell = sharedFakeShell(result);
  const client: ProcedureClient = shell.client;
  /** The arguments of npm in the first shell.run call (without the script of npm). */
  const args = (): string[] => {
    const input = shell.calls[0];
    expect(input?.command).toBe(process.execPath);
    expect(input?.args[0]).toBe(script);
    return shell.args().slice(1);
  };
  return { calls: shell.calls, client, args };
}

/** This function calls an npm procedure through the registry, with the fake shell as ctx.client. */
async function npm<T = NpmJsonOutput>(operation: string, input: unknown, client: ProcedureClient): Promise<T> {
  const path: ProcedurePath = ["npm", ...operation.split(".")];
  return outputValue(await invokePath<T>(path, input, { registry, client }), path);
}

describe("npm.view", () => {
  it("asks for JSON, puts the package after --, and gives the parsed output as data", async () => {
    const shell = fakeShell({ exitCode: 0, stdout: '{"version":"4.6.5","dist-tags":{"latest":"4.6.5"}}\n' });
    const result = await npm("view", { package: "zod", fields: ["version", "dist-tags"], registry: "https://registry.example.com/", cwd: "/w", timeout: 5000 }, shell.client);
    expect(shell.args()).toEqual(["view", "--json", "--registry=https://registry.example.com/", "--", "zod", "version", "dist-tags"]);
    expect(shell.calls[0]).toMatchObject({ cwd: "/w", timeout: 5000 });
    expect(result).toMatchObject({ success: true, data: { version: "4.6.5", "dist-tags": { latest: "4.6.5" } } });
  });

  it("gives the failure of npm without data, and refuses a package or a field that starts with -", async () => {
    const shell = fakeShell({ exitCode: 1, stdout: "", stderr: "npm error 404 Not Found" });
    expect(await npm("view", { package: "no-such-package-x" }, shell.client)).toEqual(expect.objectContaining({ success: false, exitCode: 1, stderr: "npm error 404 Not Found" }));
    expect((await npm("view", { package: "no-such-package-x" }, fakeShell({ exitCode: 1 }).client)).data).toBeUndefined();
    await expect(npm("view", { package: "--registry=https://evil.example.com" }, fakeShell().client)).rejects.toThrow("starts with");
    await expect(npm("view", { package: "zod", fields: ["-x"] }, fakeShell().client)).rejects.toThrow("starts with");
  });
});

describe("npm.distTags.*", () => {
  it("list reads each line into tags", async () => {
    const shell = fakeShell({ exitCode: 0, stdout: "beta: 2.0.0-beta.1\nlatest: 1.2.0\n" });
    const result = await npm<NpmDistTagsListOutput>("distTags.list", { package: "@scope/name" }, shell.client);
    expect(shell.args()).toEqual(["dist-tag", "ls", "--", "@scope/name"]);
    expect(result.tags).toEqual({ beta: "2.0.0-beta.1", latest: "1.2.0" });
    expect((await npm<NpmDistTagsListOutput>("distTags.list", { package: "x" }, fakeShell({ exitCode: 1 }).client)).tags).toBeUndefined();
  });

  it("add and remove need confirm: true", async () => {
    const shell = fakeShell();
    await expect(npm("distTags.add", { package: "x", version: "1.0.0", tag: "latest" }, shell.client)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(npm("distTags.remove", { package: "x", tag: "next", confirm: false }, shell.client)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    // A direct call of the functions gets the same check
    await expect(npmDistTagsAdd({ package: "x", version: "1.0.0", tag: "latest" } as never, { client: shell.client } as never)).rejects.toThrow(/confirm: true/);
    await expect(npmDistTagsRemove({ package: "x", tag: "next" } as never, { client: shell.client } as never)).rejects.toThrow(/confirm: true/);
    expect(shell.calls).toEqual([]);
  });

  it("add sets the tag, with the one-time password", async () => {
    const shell = fakeShell({ exitCode: 0, stdout: "+next: x@2.0.0\n" });
    expect(await npm("distTags.add", { package: "x", version: "2.0.0", tag: "next", otp: "123456", confirm: true }, shell.client)).toMatchObject({ success: true });
    expect(shell.args()).toEqual(["dist-tag", "add", "--otp=123456", "--", "x@2.0.0", "next"]);
  });

  it("remove removes the tag, and refuses a tag that starts with -", async () => {
    const shell = fakeShell();
    await npm("distTags.remove", { package: "x", tag: "beta", confirm: true }, shell.client);
    expect(shell.args()).toEqual(["dist-tag", "rm", "--", "x", "beta"]);
    await expect(npm("distTags.remove", { package: "x", tag: "--force", confirm: true }, fakeShell().client)).rejects.toThrow("starts with");
  });
});

describe("npm.whoami", () => {
  it("gives the user name, and none without a login", async () => {
    let shell = fakeShell({ exitCode: 0, stdout: "mark\n" });
    expect(await npm<NpmWhoamiOutput>("whoami", { registry: "https://registry.npmjs.org/" }, shell.client)).toMatchObject({ success: true, username: "mark" });
    expect(shell.args()).toEqual(["whoami", "--registry=https://registry.npmjs.org/"]);
    shell = fakeShell({ exitCode: 1, stderr: "npm error code ENEEDAUTH" });
    const anonymous = await npm<NpmWhoamiOutput>("whoami", {}, shell.client);
    expect(anonymous).toMatchObject({ success: false });
    expect(anonymous.username).toBeUndefined();
  });
});

describe("npm.pack", () => {
  const packed = [{ name: "app", version: "1.0.0", filename: "app-1.0.0.tgz", files: [{ path: "package.json" }] }];

  it("is a dry run by default, and gives the JSON of npm as data", async () => {
    const shell = fakeShell({ exitCode: 0, stdout: JSON.stringify(packed) });
    const result = await npm("pack", { cwd: "/app" }, shell.client);
    expect(shell.args()).toEqual(["pack", "--json", "--dry-run"]);
    expect(result.data).toEqual(packed);
  });

  it("writes the tarball with dryRun: false, in the destination", async () => {
    const shell = fakeShell({ exitCode: 0, stdout: JSON.stringify(packed) });
    await npm("pack", { dryRun: false, destination: "-dist" }, shell.client);
    expect(shell.args()).toEqual(["pack", "--json", "--pack-destination=-dist"]);
  });
});

describe("npm.deprecate", () => {
  it("needs confirm: true", async () => {
    const shell = fakeShell();
    await expect(npm("deprecate", { package: "x@<2", message: "Use 2.x" }, shell.client)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(npmDeprecate({ package: "x@<2", message: "Use 2.x" } as never, { client: shell.client } as never)).rejects.toThrow(/confirm: true/);
    expect(shell.calls).toEqual([]);
  });

  it("passes the message after --, so a message that starts with - stays the message", async () => {
    const shell = fakeShell();
    await npm("deprecate", { package: "x@<2.0.0", message: "--force is not needed: use 2.x", otp: "1", confirm: true }, shell.client);
    expect(shell.args()).toEqual(["deprecate", "--otp=1", "--", "x@<2.0.0", "--force is not needed: use 2.x"]);
  });

  it("removes a deprecation with an empty message", async () => {
    const shell = fakeShell();
    await npm("deprecate", { package: "x", message: "", confirm: true }, shell.client);
    expect(shell.args()).toEqual(["deprecate", "--", "x", ""]);
  });
});

describe("the helpers", () => {
  it("parseJson gives undefined for empty or broken output", () => {
    expect(parseJson("")).toBeUndefined();
    expect(parseJson("not json")).toBeUndefined();
    expect(parseJson(' "4.6.5"\n')).toBe("4.6.5");
  });

  it("parseDistTags skips the lines that are not a tag", () => {
    expect(parseDistTags("latest: 1.0.0\r\nnpm notice something\n\nnext:2.0.0\n")).toEqual({ latest: "1.0.0", next: "2.0.0" });
  });

  it("resolveNpm finds the npm of this Node without npm_execpath", () => {
    delete process.env["npm_execpath"];
    const npmProgram = resolveNpm();
    if (npmProgram.prefix.length > 0) {
      expect(npmProgram.command).toBe(process.execPath);
      expect(existsSync(npmProgram.prefix[0]!)).toBe(true);
    } else {
      expect(npmProgram.command).toBe("npm");
    }
  });

  it("resolveNpm falls back to npm on the PATH, and fails on Windows, when this Node has no npm", () => {
    delete process.env["npm_execpath"];
    const execPath = process.execPath;
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    try {
      process.execPath = join(mkdtempSync(join(tmpdir(), "npm-none-")), "bin", "node");
      Object.defineProperty(process, "platform", { ...platform, value: "linux" });
      expect(resolveNpm()).toEqual({ command: "npm", prefix: [] });
      Object.defineProperty(process, "platform", { ...platform, value: "win32" });
      expect(() => resolveNpm()).toThrow("npm was not found");
    } finally {
      process.execPath = execPath;
      Object.defineProperty(process, "platform", platform);
    }
  });

  it("resolveNpm ignores an npm_execpath that is not the script of npm", () => {
    const script = join(mkdtempSync(join(tmpdir(), "npm-other-")), "pnpm.cjs");
    writeFileSync(script, "");
    process.env["npm_execpath"] = script;
    expect(resolveNpm().prefix[0]).not.toBe(script);
  });

  it("gives a failed result, not an error, when the shell fails", async () => {
    fakeShell();
    const call = vi.fn().mockRejectedValue(new Error("spawn ENOENT"));
    const result = await npm("view", { package: "zod" }, { call } as unknown as ProcedureClient);
    expect(result).toMatchObject({ success: false, exitCode: 1, stderr: "spawn ENOENT" });
  });
});

describe("the module", () => {
  const READS_REGISTRY: Effects = { reads: ["fs", "network"], writes: [] };

  it("declares the effects of each procedure, and calls only shell.run", () => {
    const declared = Object.fromEntries(npmModule.procedures.map((procedure) => [procedure.path.join("."), procedure.metadata.effects]));
    expect(declared).toEqual({
      "npm.view": READS_REGISTRY,
      "npm.distTags.list": READS_REGISTRY,
      "npm.distTags.add": { reads: ["fs", "network"], writes: ["network"], idempotent: true },
      "npm.distTags.remove": { reads: ["fs", "network"], writes: ["network"], destructive: true, idempotent: true },
      "npm.whoami": READS_REGISTRY,
      "npm.pack": { reads: ["fs"], writes: ["fs", "process"] },
      "npm.deprecate": { reads: ["fs", "network"], writes: ["network"], destructive: false, idempotent: true },
    });
    for (const procedure of npmModule.procedures) expect(procedure.metadata.calls).toEqual(["shell.run"]);
  });

  it("registers its procedures and the shell module in a registry", () => {
    const target = createRegistry();
    registerNpmProcedures(target);
    expect(target.has(["npm", "deprecate"])).toBe(true);
    expect(target.has(["shell", "run"])).toBe(true);
  });
});
