/**
 * The env procedures (roadmap R46): one variable, the list of names, the check of the required
 * variables, the secret patterns and the reveal rule of the host.
 */

import { afterEach, describe, expect, it } from "vitest";
import { createRegistry, effectsOf, invokePath, isReadOnly, outputValue, type ProcedureModule } from "@procedures/client";
import { createEnvModule, envModule, registerEnvProcedures } from "./module.js";
import { DEFAULT_SECRET_PATTERNS, isDefaultSecret, secretMatcher } from "./secrets.js";
import type { EnvCheckOutput, EnvGetOutput, EnvListOutput } from "./types.js";

const ENV = {
  HOME: "/home/me",
  EDITOR: "vim",
  EMPTY: "",
  GITHUB_TOKEN: "ghp_secret",
  AWS_SECRET_ACCESS_KEY: "aws-secret",
  CLIENT_SECRET: "client-secret",
  DB_PASSWORD_FILE: "/run/secrets/db",
  NPM_TOKEN: "npm-secret",
  DATABASE_URL: "postgres://user:pw@host/db",
  UNSET: undefined,
};

function caller(module: ProcedureModule) {
  const registry = createRegistry(module);
  return async <T>(key: string, input: unknown): Promise<T> => {
    const path = key.split(".");
    return outputValue(await invokePath<T>(path, input, { registry }), path);
  };
}

const own = new Set<string>();
afterEach(() => {
  for (const name of own) delete process.env[name];
  own.clear();
});

describe("the secret patterns", () => {
  it("match *_TOKEN, *_KEY, *_SECRET and *PASSWORD*, and ignore the case", () => {
    expect(DEFAULT_SECRET_PATTERNS).toEqual(["*_TOKEN", "*_KEY", "*_SECRET", "*PASSWORD*"]);
    for (const name of ["GITHUB_TOKEN", "github_token", "AWS_SECRET_ACCESS_KEY", "API_KEY", "CLIENT_SECRET", "PASSWORD", "DB_PASSWORD_FILE", "pgpassword"]) {
      expect(isDefaultSecret(name), name).toBe(true);
    }
    for (const name of ["HOME", "TOKEN", "KEYS", "SECRET", "TOKEN_URL", "DATABASE_URL", "EDITOR"]) {
      expect(isDefaultSecret(name), name).toBe(false);
    }
  });

  it("treat the other characters of a pattern as text, not as a regular expression", () => {
    const matches = secretMatcher(["A.B", "X+*"]);
    expect(matches("A.B")).toBe(true);
    expect(matches("AxB")).toBe(false);
    expect(matches("X+1")).toBe(true);
    expect(matches("XX1")).toBe(false);
    expect(() => secretMatcher([""])).toThrow(/not empty/);
  });
});

describe("env.get", () => {
  const call = caller(createEnvModule({ env: ENV }));

  it("gives the value of a variable that is not a secret", async () => {
    expect(await call<EnvGetOutput>("env.get", { name: "HOME" })).toEqual({ name: "HOME", set: true, secret: false, masked: false, value: "/home/me" });
    expect(await call<EnvGetOutput>("env.get", { name: "EMPTY" })).toEqual({ name: "EMPTY", set: true, secret: false, masked: false, value: "" });
  });

  it("masks a secret: the output says that it is set, and has no value", async () => {
    const result = await call<EnvGetOutput>("env.get", { name: "GITHUB_TOKEN" });
    expect(result).toEqual({ name: "GITHUB_TOKEN", set: true, secret: true, masked: true });
    expect(JSON.stringify(result)).not.toContain("ghp_secret");
  });

  it("gives set: false for a variable that is not set, also for a secret name", async () => {
    expect(await call<EnvGetOutput>("env.get", { name: "UNSET" })).toEqual({ name: "UNSET", set: false, secret: false, masked: false });
    expect(await call<EnvGetOutput>("env.get", { name: "OTHER_TOKEN" })).toEqual({ name: "OTHER_TOKEN", set: false, secret: true, masked: false });
  });

  it("reveals the secrets that the host names, and only those", async () => {
    const reveal = caller(createEnvModule({ env: ENV, revealSecrets: ["npm_token"] }));
    expect(await reveal<EnvGetOutput>("env.get", { name: "NPM_TOKEN" })).toMatchObject({ masked: false, value: "npm-secret" });
    expect(await reveal<EnvGetOutput>("env.get", { name: "GITHUB_TOKEN" })).toMatchObject({ masked: true });
    const all = caller(createEnvModule({ env: ENV, revealSecrets: true }));
    expect(await all<EnvGetOutput>("env.get", { name: "GITHUB_TOKEN" })).toMatchObject({ secret: true, masked: false, value: "ghp_secret" });
  });

  it("masks the names of the host patterns too", async () => {
    const strict = caller(createEnvModule({ env: ENV, secretPatterns: ["DATABASE_URL"] }));
    expect(await strict<EnvGetOutput>("env.get", { name: "DATABASE_URL" })).toEqual({ name: "DATABASE_URL", set: true, secret: true, masked: true });
    expect(await call<EnvGetOutput>("env.get", { name: "DATABASE_URL" })).toMatchObject({ secret: false, value: "postgres://user:pw@host/db" });
  });

  it("refuses a name that is empty or has =", async () => {
    await expect(call("env.get", { name: "" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(call("env.get", { name: "A=B" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("env.list", () => {
  const call = caller(createEnvModule({ env: () => ENV }));

  it("gives the names sorted, with the secret flag, and no values by default", async () => {
    const { variables } = await call<EnvListOutput>("env.list", {});
    expect(variables.map((each) => each.name)).toEqual([
      "AWS_SECRET_ACCESS_KEY",
      "CLIENT_SECRET",
      "DATABASE_URL",
      "DB_PASSWORD_FILE",
      "EDITOR",
      "EMPTY",
      "GITHUB_TOKEN",
      "HOME",
      "NPM_TOKEN",
    ]);
    expect(variables.every((each) => each.value === undefined)).toBe(true);
    expect(variables.find((each) => each.name === "GITHUB_TOKEN")!.secret).toBe(true);
  });

  it("gives the values of the variables that are not secrets, never of a secret, also when the host reveals secrets", async () => {
    const reveal = caller(createEnvModule({ env: ENV, revealSecrets: true }));
    const { variables } = await reveal<EnvListOutput>("env.list", { values: true });
    expect(variables.find((each) => each.name === "HOME")).toEqual({ name: "HOME", secret: false, value: "/home/me" });
    const text = JSON.stringify(variables);
    for (const secret of ["ghp_secret", "aws-secret", "client-secret", "/run/secrets/db", "npm-secret"]) expect(text).not.toContain(secret);
  });

  it("filters by a prefix and ignores the case", async () => {
    const { variables } = await call<EnvListOutput>("env.list", { prefix: "e" });
    expect(variables.map((each) => each.name)).toEqual(["EDITOR", "EMPTY"]);
  });
});

describe("env.check", () => {
  const call = caller(createEnvModule({ env: ENV }));

  it("gives the missing and the present variables, in the order of the input", async () => {
    expect(await call<EnvCheckOutput>("env.check", { required: ["UNSET", "HOME", "NOPE", "GITHUB_TOKEN", "HOME"] })).toEqual({
      ok: false,
      missing: ["UNSET", "NOPE"],
      present: ["HOME", "GITHUB_TOKEN"],
    });
    expect(await call<EnvCheckOutput>("env.check", { required: [] })).toEqual({ ok: true, missing: [], present: [] });
  });

  it("counts an empty value as missing unless allowEmpty is true", async () => {
    expect(await call<EnvCheckOutput>("env.check", { required: ["EMPTY"] })).toEqual({ ok: false, missing: ["EMPTY"], present: [] });
    expect(await call<EnvCheckOutput>("env.check", { required: ["EMPTY"], allowEmpty: true })).toEqual({ ok: true, missing: [], present: ["EMPTY"] });
  });

  it("gives names only, never a value", async () => {
    const result = await call<EnvCheckOutput>("env.check", { required: ["GITHUB_TOKEN"] });
    expect(JSON.stringify(result)).not.toContain("ghp_secret");
  });
});

describe("the module", () => {
  it("reads process.env at each call by default", async () => {
    const call = caller(envModule);
    own.add("R46_ENV_TEST_VALUE");
    own.add("R46_ENV_TEST_TOKEN");
    expect(await call<EnvGetOutput>("env.get", { name: "R46_ENV_TEST_VALUE" })).toMatchObject({ set: false });
    process.env["R46_ENV_TEST_VALUE"] = "one";
    process.env["R46_ENV_TEST_TOKEN"] = "two";
    expect(await call<EnvGetOutput>("env.get", { name: "R46_ENV_TEST_VALUE" })).toMatchObject({ set: true, value: "one" });
    expect(await call<EnvGetOutput>("env.get", { name: "R46_ENV_TEST_TOKEN" })).toEqual({ name: "R46_ENV_TEST_TOKEN", set: true, secret: true, masked: true });
    const listed = await call<EnvListOutput>("env.list", { prefix: "R46_ENV_TEST", values: true });
    expect(listed.variables).toEqual([
      { name: "R46_ENV_TEST_TOKEN", secret: true },
      { name: "R46_ENV_TEST_VALUE", secret: false, value: "one" },
    ]);
  });

  it("gives envModule for no options, and declares that each procedure reads the process and changes nothing", () => {
    expect(createEnvModule()).toBe(envModule);
    expect(createEnvModule({ env: undefined })).toBe(envModule);
    for (const procedure of envModule.procedures) {
      expect(effectsOf(procedure), procedure.path.join(".")).toEqual({ reads: ["process"], writes: [] });
      expect(isReadOnly(effectsOf(procedure))).toBe(true);
    }
    expect(envModule.procedures.map((procedure) => procedure.path.join("."))).toEqual(["env.get", "env.list", "env.check"]);
  });

  it("registers the procedures of the options in a registry", async () => {
    const registry = createRegistry();
    registerEnvProcedures(registry, { env: { A_TOKEN: "x" }, revealSecrets: true });
    const output = await invokePath<EnvGetOutput>(["env", "get"], { name: "A_TOKEN" }, { registry });
    expect(await outputValue(output)).toMatchObject({ value: "x" });
  });
});
