import { describe, expect, it, vi } from "vitest";
import { createRegistry, invokePath, outputValue } from "@procedures/client";
import type { CommandOptions, CommandResult } from "@procedures/shell/command";
import { buildArgv, parseJsonOutput } from "./argv.js";
import { findRestic } from "./executable.js";
import { createResticModule, resticModule } from "./module.js";
import { resticArgv, runRestic, type ResticRunner } from "./procedures.js";

/** A runner that records each start of restic and answers with the next scripted result. */
function fakeRunner(results: Array<Partial<CommandResult>> = []) {
  const starts: Array<{ command: string; options: CommandOptions }> = [];
  const run: ResticRunner = async (command, options) => {
    starts.push({ command, options });
    const result = results.shift() ?? {};
    return { exitCode: 0, stdout: "", stderr: "", success: true, duration: 1, ...result };
  };
  return { starts, run };
}

describe("argv", () => {
  it("puts the path, the flags, the named arguments, then -- and the positional arguments", () => {
    expect(
      buildArgv({ path: ["backup"], flags: ["--json"], args: { tag: ["daily", "home"], "one-file-system": true, "dry-run": false, limit: 3 }, positional: ["-dir"] })
    ).toEqual(["backup", "--json", "--tag=daily", "--tag=home", "--one-file-system", "--limit=3", "--", "-dir"]);
  });

  it("refuses an argument name that is not a flag name", () => {
    expect(() => buildArgv({ path: ["x"], args: { "--repo": "y" } })).toThrow(/not a flag name/);
  });

  it("reads one JSON document or NDJSON", () => {
    expect(parseJsonOutput('[{"id":"a"}]')).toEqual([{ id: "a" }]);
    expect(parseJsonOutput('{"a":1}\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }]);
    // A blank line between the documents gives no document
    expect(parseJsonOutput('{"a":1}\n\n  \r\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }]);
    expect(parseJsonOutput("not json")).toBeUndefined();
    expect(parseJsonOutput("")).toBeUndefined();
  });
});

describe("restic.run", () => {
  it("adds --repo and --json, and refuses --password-command", () => {
    expect(resticArgv({ path: ["snapshots"], repository: "/backups/repo", json: true })).toEqual(["snapshots", "--repo=/backups/repo", "--json"]);
    expect(() => resticArgv({ path: ["snapshots"], json: true, args: { "password-command": "x" } })).toThrow(/refuses --password-command/);
  });

  it("reports a program that does not start", async () => {
    // The program comes from the module (audit pass 2, O55)
    const registry = createRegistry(createResticModule({ executable: "restic-that-does-not-exist-0" }));
    const call = invokePath(["restic", "run"], { path: ["version"] }, { registry }).then((output) => outputValue(output, ["restic", "run"]));
    await expect(call).rejects.toThrow(/restic did not start/);
  });

  // The deprecated path (audit pass 2, O55): the input executable still works in 0.28, with one notice
  it("still takes the deprecated input executable over the module, and emits one notice that names the new path", async () => {
    const emitWarning = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
    try {
      const { starts, run } = fakeRunner([{ stdout: "[]" }, { stdout: "[]" }]);
      const registry = createRegistry(createResticModule({ run, executable: "/opt/restic-of-the-module" }));
      for (let i = 0; i < 2; i++) await invokePath(["restic", "run"], { path: ["snapshots"], executable: "/opt/restic-of-the-input" }, { registry });
      expect(starts.map((start) => start.command)).toEqual(["/opt/restic-of-the-input", "/opt/restic-of-the-input"]);
      expect(emitWarning).toHaveBeenCalledTimes(1);
      const [message, options] = emitWarning.mock.calls[0]!;
      expect(options).toEqual({ type: "DeprecationWarning", code: "PROCEDURES_RESTIC_EXECUTABLE_INPUT" });
      expect(String(message)).toContain("createResticModule({ executable })");
      expect(String(message)).toContain("RESTIC_EXE");
    } finally {
      emitWarning.mockRestore();
    }
  });

  it("takes the program from RESTIC_EXE without the option, with no notice", async () => {
    const emitWarning = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
    const before = process.env["RESTIC_EXE"];
    process.env["RESTIC_EXE"] = "/opt/restic-of-the-env";
    try {
      const { starts, run } = fakeRunner([{ stdout: "[]" }]);
      await invokePath(["restic", "run"], { path: ["snapshots"] }, { registry: createRegistry(createResticModule({ run })) });
      expect(starts[0]?.command).toBe("/opt/restic-of-the-env");
      expect(emitWarning).not.toHaveBeenCalled();
    } finally {
      if (before === undefined) delete process.env["RESTIC_EXE"];
      else process.env["RESTIC_EXE"] = before;
      emitWarning.mockRestore();
    }
  });

  it("gives no env to restic: the input has no field for secrets", async () => {
    const { starts, run } = fakeRunner([{ stdout: "[]" }]);
    const registry = createRegistry(createResticModule({ run }));
    const output = await invokePath(["restic", "run"], { path: ["snapshots"], env: { RESTIC_PASSWORD: "from-the-input" } }, { registry });
    expect(await outputValue(output, ["restic", "run"])).toMatchObject({ success: true, json: [] });
    expect(starts[0]!.options.env).toBeUndefined();
    expect(starts[0]!.options.args).toEqual(["snapshots", "--json"]);
  });

  it("gives the env of the host to each restic process with createResticModule", async () => {
    const { starts, run } = fakeRunner([{ stdout: "[]" }]);
    const env = { RESTIC_REPOSITORY: "b2:bucket-name:path", RESTIC_PASSWORD: "synthetic-password" };
    const registry = createRegistry(createResticModule({ env, run, executable: "/opt/restic" }));
    const output = await outputValue(await invokePath(["restic", "run"], { path: ["snapshots"] }, { registry }), ["restic", "run"]);
    expect(starts[0]).toMatchObject({ command: "/opt/restic", options: { env } });
    // The output has no value of the env
    expect(JSON.stringify(output)).not.toContain("synthetic-password");
    expect(createResticModule()).toBe(resticModule);
  });
});

describe("runRestic", () => {
  it("starts restic with the env only for its process, and reads the JSON lines", async () => {
    const { starts, run } = fakeRunner([{ stdout: '{"message_type":"status"}\n{"message_type":"summary","snapshot_id":"abc"}\n' }]);
    const before = process.env["RESTIC_PASSWORD"];
    const result = await runRestic(
      { path: ["backup"], positional: ["/data/ledger", "/data/blobs"], args: { tag: ["daily"] } },
      { executable: "restic-test", env: { RESTIC_PASSWORD: "synthetic", B2_ACCOUNT_ID: "id", B2_ACCOUNT_KEY: "key", AWS_PROFILE: undefined }, cwd: "/data", timeout: 1000, run },
    );
    expect(result).toEqual({
      exitCode: 0,
      success: true,
      stdout: expect.any(String),
      stderr: "",
      json: [{ message_type: "status" }, { message_type: "summary", snapshot_id: "abc" }],
    });
    expect(starts[0]!.command).toBe("restic-test");
    expect(starts[0]!.options).toMatchObject({
      args: ["backup", "--json", "--tag=daily", "--", "/data/ledger", "/data/blobs"],
      cwd: "/data",
      timeout: 1000,
      env: { RESTIC_PASSWORD: "synthetic", B2_ACCOUNT_ID: "id", B2_ACCOUNT_KEY: "key", AWS_PROFILE: undefined },
    });
    // The environment of the host does not change
    expect(process.env["RESTIC_PASSWORD"]).toBe(before);
  });

  it("passes the flags of a forget and a restore, and reads no JSON with json: false", async () => {
    const { starts, run } = fakeRunner([{ exitCode: 1, success: false, stderr: "unable to open repository" }, { stdout: "restored" }]);
    const forget = await runRestic({ path: ["forget"], args: { "keep-daily": 14, "keep-weekly": 12, "keep-monthly": 24, prune: true }, json: false }, { run });
    expect(forget).toEqual({ exitCode: 1, success: false, stdout: "", stderr: "unable to open repository" });
    expect(starts[0]!.options.args).toEqual(["forget", "--keep-daily=14", "--keep-weekly=12", "--keep-monthly=24", "--prune"]);
    await runRestic({ path: ["restore"], positional: ["latest"], args: { target: "/restore/here", include: "*ledger*" }, json: false }, { run });
    expect(starts[1]!.options.args).toEqual(["restore", "--target=/restore/here", "--include=*ledger*", "--", "latest"]);
    expect(starts[1]!.options.env).toBeUndefined();
  });

  it("gives maxOutputBytes to the runner, and tells which output lost bytes", async () => {
    const { starts, run } = fakeRunner([{ stdout: "x", truncated: { stdout: true, stderr: false } }, {}]);
    const cut = await runRestic({ path: ["ls"], positional: ["latest"], json: false }, { run, maxOutputBytes: 1024 });
    expect(starts[0]!.options.maxOutputBytes).toBe(1024);
    expect(cut.truncated).toEqual({ stdout: true, stderr: false });
    const whole = await runRestic({ path: ["ls"], positional: ["latest"], json: false }, { run });
    expect("maxOutputBytes" in starts[1]!.options).toBe(false);
    expect(whole.truncated).toBeUndefined();
  });

  it("throws when restic does not start, and refuses --password-command", async () => {
    const { run } = fakeRunner([{ exitCode: 1, success: false, error: "spawn restic ENOENT" }]);
    await expect(runRestic({ path: ["version"] }, { run })).rejects.toThrow("restic did not start: spawn restic ENOENT");
    await expect(runRestic({ path: ["snapshots"], args: { "password-command": "echo x" } }, { run })).rejects.toThrow(/refuses --password-command/);
  });
});

describe("findRestic", () => {
  const packages = "C:\\Users\\someone\\AppData\\Local\\Microsoft\\WinGet\\Packages";
  const folders: Record<string, string[]> = {
    [packages]: ["Other.Tool_x", "restic.restic_Microsoft.Winget.Source_8wekyb3d8bbwe"],
    [`${packages}\\restic.restic_Microsoft.Winget.Source_8wekyb3d8bbwe`]: ["LICENSE.txt", "restic_0.17.3_windows_amd64.exe"],
  };
  const list = async (folder: string): Promise<string[]> => folders[folder] ?? [];
  const exists = (path: string): boolean => path in folders;

  it("gives RESTIC_EXE first", async () => {
    expect(await findRestic({ env: { RESTIC_EXE: "/opt/bin/restic" }, platform: "win32", list, exists })).toBe("/opt/bin/restic");
  });

  it("finds the program of a WinGet package on Windows", async () => {
    expect(await findRestic({ env: { LOCALAPPDATA: "C:\\Users\\someone\\AppData\\Local" }, platform: "win32", list, exists })).toBe(
      `${packages}\\restic.restic_Microsoft.Winget.Source_8wekyb3d8bbwe\\restic_0.17.3_windows_amd64.exe`,
    );
  });

  it("gives restic on another platform, without a package, and when a folder cannot be read", async () => {
    expect(await findRestic({ env: { LOCALAPPDATA: "C:\\Users\\someone\\AppData\\Local" }, platform: "linux", list, exists })).toBe("restic");
    expect(await findRestic({ env: {}, platform: "win32", list, exists })).toBe("restic");
    expect(await findRestic({ env: { LOCALAPPDATA: "C:\\Users\\someone\\AppData\\Local" }, platform: "win32", list: async () => Promise.reject(new Error("EACCES")), exists })).toBe("restic");
  });
});
