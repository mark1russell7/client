/**
 * The procedures `server.start`, `server.stop` and `server.status` under the root of a host
 * (roadmap R33, tracker item O36): a root refuses them, with the reason in their rules. They read
 * and write the lock files in the home folder, and `server.start` starts a server without the
 * root. Without a root, nothing changes. The tests do not start the handlers without a root,
 * because those read the lock files of the machine.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry, invokePath, type ProcedureRegistry } from "@procedures/client";
import { confineToRoot, rootDecisionOf } from "@procedures/fs/module";
import { hostProcedures, serverModule } from "./module.js";

let base: string;
let root: string;
let rooted: ProcedureRegistry;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "server-host-root-"));
  root = join(base, "root");
  mkdirSync(root);
  rooted = createRegistry(serverModule);
  confineToRoot(rooted, root);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("the server procedures under the root of a host", () => {
  it("are refused, with the reason", () => {
    for (const procedure of hostProcedures) {
      const decision = rootDecisionOf(procedure);
      expect(decision.kind, procedure.path.join(".")).toBe("refused");
      expect(decision.reason).toContain("~/.mark");
    }
  });

  it("refuse each call, and start no handler", async () => {
    for (const [key, input] of [
      ["server.start", { port: 1 }],
      ["server.stop", { port: 1 }],
      ["server.status", { port: 1 }],
    ] as const) {
      await expect(invokePath(key.split("."), input, { registry: rooted }), key).rejects.toMatchObject({ code: "FORBIDDEN", reason: "outside-root" });
    }
  });

  it("keep the handlers without a root", () => {
    const plain = createRegistry(serverModule);
    for (const procedure of hostProcedures) expect(plain.get(procedure.path)?.handler).toBe(procedure.handler);
  });
});
