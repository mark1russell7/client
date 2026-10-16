/**
 * The gh procedures (roadmap R42) with a fake shell: each argument list, the JSON of gh, the
 * failures, and the values that must not become options.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createProcedure, createRegistry, defineModule, effectsOf, invokePath, outputValue, zodAdapter, type ProcedureRegistry } from "@procedures/client";
import { ghModule } from "./module.js";
import { GhError, urlOf } from "./procedures/gh/shared.js";

interface ShellCall {
  command: string;
  args: string[];
  cwd?: string | undefined;
  timeout?: number | undefined;
}

/** A registry whose shell.run records each call and answers with the next scripted result. */
function fake(results: Array<{ exitCode?: number; stdout?: string; stderr?: string }> = []) {
  const calls: ShellCall[] = [];
  const shell = defineModule("@procedures/shell", [
    createProcedure()
      .path(["shell", "run"])
      .input(zodAdapter<ShellCall>(z.object({ command: z.string(), args: z.array(z.string()), cwd: z.string().optional(), timeout: z.number().optional() })))
      .output(zodAdapter<unknown>(z.unknown()))
      .meta({ effects: { reads: ["process"], writes: ["process"] } })
      .handler(async (input: ShellCall) => {
        calls.push(input);
        const result = results.shift() ?? {};
        return { exitCode: result.exitCode ?? 0, stdout: result.stdout ?? "[]", stderr: result.stderr ?? "" };
      })
      .build(),
  ]);
  // The first module of a name counts: the fake shell takes the place of the real one
  const registry: ProcedureRegistry = createRegistry(shell, ghModule);
  const call = async <T>(key: string, input: unknown): Promise<T> => {
    const path = key.split(".");
    return outputValue(await invokePath<T>(path, input, { registry }), path);
  };
  return { calls, call, registry };
}

describe("the gh procedures (R42)", () => {
  it("list pull requests with their fields and filters, and give the JSON of gh", async () => {
    const { calls, call } = fake([{ stdout: JSON.stringify([{ number: 7, title: "x" }]) }]);
    const result = await call<{ items: unknown[] }>("gh.pr.list", { repo: "owner/name", state: "all", author: "me", base: "main", limit: 5 });
    expect(result.items).toEqual([{ number: 7, title: "x" }]);
    expect(calls[0]!.command).toBe("gh");
    expect(calls[0]!.args.slice(0, 4)).toEqual(["pr", "list", "--json", expect.stringContaining("number,title")]);
    expect(calls[0]!.args).toEqual(expect.arrayContaining(["--state", "all", "--limit", "5", "--repo", "owner/name", "--author", "me", "--base", "main"]));
  });

  it("view a pull request, a run, a release and an issue", async () => {
    const { calls, call } = fake([{ stdout: "{\"number\":1}" }, { stdout: "{\"databaseId\":2}" }, { stdout: "{\"tagName\":\"v1\"}" }, { stdout: "{\"number\":3}" }]);
    expect(await call("gh.pr.view", { pr: "12" })).toEqual({ item: { number: 1 } });
    expect(await call("gh.run.view", { run: 99, cwd: "/repo", timeoutMs: 5000 })).toEqual({ item: { databaseId: 2 } });
    expect(await call("gh.release.view", {})).toEqual({ item: { tagName: "v1" } });
    expect(await call("gh.issue.view", { issue: "3" })).toEqual({ item: { number: 3 } });
    expect(calls.map((each) => each.args.slice(0, 3))).toEqual([
      ["pr", "view", "12"],
      ["run", "view", "99"],
      ["release", "view", "--json"],
      ["issue", "view", "3"],
    ]);
    expect(calls[1]).toMatchObject({ cwd: "/repo", timeout: 5000 });
  });

  it("list runs, checks, releases and issues", async () => {
    const { calls, call } = fake();
    await call("gh.run.list", { workflow: "ci.yml", branch: "main", status: "failure" });
    await call("gh.pr.checks", { pr: "4" });
    await call("gh.release.list", { limit: 3 });
    await call("gh.issue.list", { label: "bug", state: "closed", search: "crash" });
    expect(calls[0]!.args).toEqual(expect.arrayContaining(["--workflow", "ci.yml", "--branch", "main", "--status", "failure", "--limit", "20"]));
    expect(calls[1]!.args.slice(0, 3)).toEqual(["pr", "checks", "4"]);
    expect(calls[2]!.args).toEqual(expect.arrayContaining(["--limit", "3"]));
    expect(calls[3]!.args).toEqual(expect.arrayContaining(["--label", "bug", "--state", "closed", "--search", "crash"]));
  });

  it("make a pull request, an issue and a comment, and give the URL that gh prints", async () => {
    const { calls, call } = fake([
      { stdout: "Creating pull request\nhttps://github.com/o/n/pull/5\n" },
      { stdout: "https://github.com/o/n/issues/6\n" },
      { stdout: "https://github.com/o/n/issues/6#issuecomment-1\n" },
      { stdout: "" },
    ]);
    expect(await call("gh.pr.create", { title: "-starts with a hyphen", body: "text", base: "main", draft: true })).toEqual({ url: "https://github.com/o/n/pull/5" });
    expect(await call("gh.issue.create", { title: "t", body: "b", labels: ["bug"] })).toEqual({ url: "https://github.com/o/n/issues/6" });
    expect(await call("gh.issue.comment", { issue: "6", body: "hello" })).toEqual({ url: "https://github.com/o/n/issues/6#issuecomment-1" });
    expect(await call("gh.run.rerun", { run: 8, failedOnly: true })).toEqual({ run: 8 });
    // A title is the value of --title: a leading hyphen is text, not an option
    expect(calls[0]!.args).toEqual(["pr", "create", "--title", "-starts with a hyphen", "--body", "text", "--base", "main", "--draft"]);
    expect(calls[1]!.args).toEqual(expect.arrayContaining(["--label", "bug"]));
    expect(calls[3]!.args).toEqual(["run", "rerun", "8", "--failed"]);
  });

  it("refuse a value that gh would read as an option, and a repository that is not owner/name", async () => {
    const { calls, call } = fake();
    await expect(call("gh.pr.view", { pr: "--web" })).rejects.toThrow('starts with "-"');
    await expect(call("gh.issue.list", { label: "-x" })).rejects.toThrow('starts with "-"');
    await expect(call("gh.pr.list", { repo: "not a repo" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(calls).toEqual([]);
  });

  it("give the error of a failed command, and of output that is not JSON", async () => {
    const { call } = fake([{ exitCode: 1, stderr: "HTTP 404: Not Found" }, { stdout: "not json" }, { exitCode: 8, stdout: "[]" }]);
    await expect(call("gh.pr.view", { pr: "1" })).rejects.toThrow("HTTP 404");
    await expect(call("gh.pr.list", {})).rejects.toThrow("gave no JSON");
    await expect(call("gh.pr.checks", { pr: "1" })).rejects.toThrow("pending");
  });

  it("declare the effects and the call of shell.run of each procedure", () => {
    const { registry } = fake();
    const gh = registry.getAll().filter((procedure) => procedure.path[0] === "gh");
    expect(gh).toHaveLength(13);
    for (const procedure of gh) {
      const effects = effectsOf(procedure)!;
      expect(effects.reads, procedure.path.join(".")).toEqual(["network"]);
      const writes = ["create", "comment", "rerun"].includes(procedure.path[2]!);
      expect(effects.writes, procedure.path.join(".")).toEqual(writes ? ["network"] : []);
      expect((procedure.metadata as { calls?: string[] }).calls).toEqual(["shell.run"]);
    }
  });

  it("read the URL from the last line of the output", () => {
    expect(urlOf("a\nhttps://x/1\n")).toBe("https://x/1");
    expect(urlOf("no url")).toBe("no url");
    expect(new GhError("m", 2, "e")).toMatchObject({ exitCode: 2, stderr: "e", name: "GhError" });
  });
});
