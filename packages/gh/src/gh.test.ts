/**
 * The gh procedures (roadmap R42) with a fake shell: each argument list, the JSON of gh, the
 * failures, and the values that must not become options.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createProcedure, createRegistry, defineModule, effectsOf, invokePath, outputValue, zodAdapter, type ProcedureRegistry } from "@procedures/client";
import { ghModule } from "./module.js";
import { existsSync, readFileSync } from "node:fs";
import { GhError, urlOf } from "./procedures/gh/shared.js";
import { jsonValues, parseGhApiOutput } from "./procedures/gh/api.js";

interface ShellCall {
  command: string;
  args: string[];
  cwd?: string | undefined;
  timeout?: number | undefined;
  env?: Record<string, string> | undefined;
}

/** A registry whose shell.run records each call and answers with the next scripted result. */
function fake(results: Array<{ exitCode?: number; stdout?: string; stderr?: string }> = [], inspect?: (call: ShellCall) => void) {
  const calls: ShellCall[] = [];
  const shell = defineModule("@procedures/shell", [
    createProcedure()
      .path(["shell", "run"])
      .input(zodAdapter<ShellCall>(z.object({ command: z.string(), args: z.array(z.string()), cwd: z.string().optional(), timeout: z.number().optional(), env: z.record(z.string(), z.string()).optional() })))
      .output(zodAdapter<unknown>(z.unknown()))
      .meta({ effects: { reads: ["process"], writes: ["process"] } })
      .handler(async (input: ShellCall) => {
        calls.push(input);
        inspect?.(input);
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
    expect(gh).toHaveLength(16);
    const writesOf: Record<string, string[]> = { "gh.run.download": ["fs"], "gh.api": ["network"], "gh.workflow.run": ["network"] };
    for (const procedure of gh) {
      const key = procedure.path.join(".");
      const effects = effectsOf(procedure)!;
      expect(effects.reads, key).toEqual(["network"]);
      const writes = writesOf[key] ?? (["create", "comment", "rerun"].includes(procedure.path[2]!) ? ["network"] : []);
      expect(effects.writes, key).toEqual(writes);
      expect((procedure.metadata as { calls?: string[] }).calls).toEqual(["shell.run"]);
    }
    const flags = (key: string) => {
      const effects = effectsOf(gh.find((procedure) => procedure.path.join(".") === key)!)!;
      return { destructive: effects.destructive, idempotent: effects.idempotent };
    };
    // A method other than GET can replace or delete data: gh.api keeps the default, destructive
    expect(flags("gh.api")).toEqual({ destructive: undefined, idempotent: undefined });
    expect(flags("gh.workflow.run")).toEqual({ destructive: false, idempotent: false });
    expect(flags("gh.run.download")).toEqual({ destructive: false, idempotent: false });
  });

  it("read the URL from the last line of the output", () => {
    expect(urlOf("a\nhttps://x/1\n")).toBe("https://x/1");
    expect(urlOf("no url")).toBe("no url");
    expect(new GhError("m", 2, "e")).toMatchObject({ exitCode: 2, stderr: "e", name: "GhError" });
  });
});

describe("gh.workflow.run, gh.run.download and gh.api", () => {
  it("start a workflow run with its ref and its inputs, and read the run from the URL that gh prints", async () => {
    const { calls, call } = fake([{ stdout: "https://github.com/o/n/actions/runs/4242\n" }, { stdout: "" }]);
    expect(await call("gh.workflow.run", { workflow: "cells.yml", repo: "o/n", ref: "stage-1", inputs: { file: "queue/a b.json", shards: "3", only: "-x" } })).toEqual({
      workflow: "cells.yml",
      ref: "stage-1",
      url: "https://github.com/o/n/actions/runs/4242",
      run: 4242,
    });
    expect(calls[0]!.args).toEqual(["workflow", "run", "cells.yml", "--repo", "o/n", "--ref", "stage-1", "-f", "file=queue/a b.json", "-f", "shards=3", "-f", "only=-x"]);
    // An older gh, or GitHub without the run details, prints nothing: the output has no run
    expect(await call("gh.workflow.run", { workflow: "ci.yml" })).toEqual({ workflow: "ci.yml" });
    expect(calls[1]!.args).toEqual(["workflow", "run", "ci.yml"]);
  });

  it("download the artifacts of a run, by name, by pattern and into a folder", async () => {
    const { calls, call } = fake([{ stdout: "" }, { stdout: "" }, { exitCode: 1, stderr: "no valid artifacts found to download" }]);
    expect(await call("gh.run.download", { run: 77, repo: "o/n", names: ["records"], patterns: ["shard-*"], dir: "/tmp/into" })).toEqual({ run: 77, dir: "/tmp/into" });
    expect(calls[0]!.args).toEqual(["run", "download", "77", "--repo", "o/n", "--name", "records", "--pattern", "shard-*", "--dir", "/tmp/into"]);
    expect(await call("gh.run.download", { run: 78 })).toEqual({ run: 78, dir: "." });
    expect(calls[1]!.args).toEqual(["run", "download", "78"]);
    await expect(call("gh.run.download", { run: 79 })).rejects.toThrow("no valid artifacts");
  });

  it("call the API with an explicit method, string fields as -f and other fields as -F, and give the parsed JSON", async () => {
    const { calls, call } = fake([{ stdout: '{"object":{"sha":"abc"}}' }, { stdout: '{"ref":"refs/heads/x"}' }]);
    expect(await call("gh.api", { endpoint: "repos/{owner}/{repo}/branches/main", repo: "o/n" })).toEqual({ data: { object: { sha: "abc" } } });
    // gh api has no --repo: the repository goes as GH_REPO, for the placeholders of the endpoint
    expect(calls[0]!.args).toEqual(["api", "repos/{owner}/{repo}/branches/main", "--method", "GET"]);
    expect(calls[0]!.env).toEqual({ GH_REPO: "o/n" });
    await call("gh.api", { endpoint: "repos/o/n/refs", method: "POST", fields: { ref: "refs/heads/x", sha: "@not-a-file", force: false, count: 2, note: null } });
    expect(calls[1]!.args).toEqual(["api", "repos/o/n/refs", "--method", "POST", "-f", "ref=refs/heads/x", "-f", "sha=@not-a-file", "-F", "force=false", "-F", "count=2", "-F", "note=null"]);
    expect(calls[1]!.env).toBeUndefined();
  });

  it("send a JSON body from a temporary file, and remove the file after the call", async () => {
    let seen: { path: string; text: string } | undefined;
    const { calls, call } = fake([{ stdout: '{"content":{"path":"queue/x.json"}}' }, { exitCode: 1, stderr: "gh: Not Found (HTTP 404)" }], (input) => {
      const at = input.args.indexOf("--input");
      if (at >= 0) seen = { path: input.args[at + 1]!, text: readFileSync(input.args[at + 1]!, "utf8") };
    });
    const body = { message: "queue: 2 cells", branch: "stage-1", content: "W10=" };
    expect(await call("gh.api", { endpoint: "repos/o/n/contents/queue/x.json", method: "PUT", body })).toEqual({ data: { content: { path: "queue/x.json" } } });
    expect(calls[0]!.args.slice(0, 4)).toEqual(["api", "repos/o/n/contents/queue/x.json", "--method", "PUT"]);
    expect(JSON.parse(seen!.text)).toEqual(body);
    expect(existsSync(seen!.path)).toBe(false);
    // A failed call removes the file too
    await expect(call("gh.api", { endpoint: "repos/o/n/contents/y", method: "PUT", body: { a: 1 } })).rejects.toThrow("HTTP 404");
    expect(existsSync(seen!.path)).toBe(false);
  });

  it("give null for an empty response, and join the pages of a paginated array", async () => {
    const { calls, call } = fake([{ stdout: "" }, { stdout: '[{"id":1},{"id":2}]\n[{"id":3}]\n' }, { stdout: '{"total_count":1}{"total_count":1}' }]);
    expect(await call("gh.api", { endpoint: "repos/o/n/refs/heads/x", method: "DELETE" })).toEqual({ data: null });
    expect(await call("gh.api", { endpoint: "repos/o/n/pulls", paginate: true })).toEqual({ data: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    expect(calls[1]!.args).toEqual(["api", "repos/o/n/pulls", "--method", "GET", "--paginate"]);
    expect(await call("gh.api", { endpoint: "search/issues", paginate: true, fields: { q: "is:open" } })).toEqual({ data: [{ total_count: 1 }, { total_count: 1 }] });
  });

  it("refuse values that gh would read as options, and a field name with =", async () => {
    const { calls, call } = fake();
    await expect(call("gh.api", { endpoint: "--hostname" })).rejects.toThrow('starts with "-"');
    await expect(call("gh.api", { endpoint: "x", fields: { "a=b": "c" } })).rejects.toThrow("Invalid field name");
    await expect(call("gh.api", { endpoint: "x", method: "TRACE" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(call("gh.workflow.run", { workflow: "-x" })).rejects.toThrow('starts with "-"');
    await expect(call("gh.workflow.run", { workflow: "ci.yml", inputs: { "": "x" } })).rejects.toThrow("Invalid input name");
    await expect(call("gh.run.download", { run: 1, names: ["--all"] })).rejects.toThrow('starts with "-"');
    expect(calls).toEqual([]);
  });

  it("read the output of gh api", () => {
    expect(parseGhApiOutput("  \n")).toBeNull();
    expect(parseGhApiOutput('{"a":1}')).toEqual({ a: 1 });
    expect(parseGhApiOutput('{"a":1}', true)).toEqual([{ a: 1 }]);
    expect(parseGhApiOutput("[1]", true)).toEqual([1]);
    expect(() => parseGhApiOutput("[1][2]")).toThrow("gave no JSON");
    expect(() => parseGhApiOutput("not json", true)).toThrow("gave no JSON");
    // A bracket and an escaped quote in a string do not end a value
    expect(jsonValues('[{"t":"a ] \\" } ["}]\n{"b":[]}')).toEqual([[{ t: 'a ] " } [' }], { b: [] }]);
    expect(() => jsonValues('[1] "x"')).toThrow();
    expect(() => jsonValues("[1")).toThrow("ends too early");
  });
});
