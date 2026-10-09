/**
 * A smoke test of the vitest.* tools of the MCP server: the test calls each one through the
 * registry, as the MCP server does, against the small project in fixtures/project.
 */

import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@mark1russell7/client";
import "./register.js";
import type { VitestRunOutput } from "./types.js";

const cwd = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "project");
const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

describe("vitest tools through the registry", () => {
  it("vitest.run runs the tests of a project", async () => {
    const result = await client.call<unknown, VitestRunOutput>({ service: "vitest", operation: "run" }, { cwd, include: ["sum"] });
    expect(result).toMatchObject({ success: true, passed: 2, failed: 0 });
  }, 60_000);

  it("vitest.coverage gives the coverage", async () => {
    const result = await client.call<unknown, VitestRunOutput>({ service: "vitest", operation: "coverage" }, { cwd, include: ["sum"] });
    expect(result.success).toBe(true);
    expect(result.coverage?.lines).toBeGreaterThan(0);
  }, 60_000);
});
