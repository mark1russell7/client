/**
 * The modules of the dev bundle. An import of the package root registers nothing, and the
 * `./register` entry registers the procedures of each module (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */

import { describe, expect, it } from "vitest";
import { clientModule, createRegistry, PROCEDURE_REGISTRY } from "@procedures/client";
import shellModule from "@procedures/shell/module";
import fsModule from "@procedures/fs/module";
import cliModule from "@procedures/cli-run/module";
import pnpmModule from "@procedures/pnpm/module";
import libModule from "@procedures/lib/module";
import dagModule from "@procedures/dag/module";
import procedureModule from "@procedures/procedure/module";
import compilerModule from "@procedures/compiler/module";
import { bundleDevModule, bundleDevModules } from "./index.js";

/** One procedure of each module. `git.status` comes with `libModule`. */
const KEYS = [
  "client.chain",
  "shell.run",
  "fs.readdir",
  "cli.run",
  "pnpm.install",
  "lib.new",
  "lib.scan",
  "git.status",
  "dag.traverse",
  "procedure.new",
  "program.check",
];

describe("bundle-dev", () => {
  it("holds the modules of the dev workflow in their order", () => {
    const expected = [clientModule, shellModule, fsModule, cliModule, pnpmModule, libModule, dagModule, procedureModule, compilerModule];
    expect(bundleDevModules).toHaveLength(expected.length);
    expected.forEach((module, index) => expect(bundleDevModules[index], `module ${index}`).toBe(module));
  });

  it("gives the procedures of each module in a new registry", () => {
    const registry = createRegistry(bundleDevModule);
    for (const key of KEYS) expect(registry.get(key.split("."))?.handler, key).toBeDefined();
  });

  // This test changes the global registry, so it is the last test of the file
  it("registers nothing on an import of the root, and registers the procedures on an import of ./register", async () => {
    for (const key of KEYS) expect(PROCEDURE_REGISTRY.get(key.split(".")), key).toBeUndefined();
    await import("./register.js");
    for (const key of KEYS) expect(PROCEDURE_REGISTRY.get(key.split("."))?.handler, key).toBeDefined();
  });
});
