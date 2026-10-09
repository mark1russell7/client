/**
 * lib.audit reports the procedure flags that hide a global flag of mark (deep dive CLI-7).
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createProcedure, outputSchema, zodAdapter, type AnyProcedure } from "@mark1russell7/client";
import { findFlagNotices } from "./audit.js";

function procedure(path: string[], schema: z.ZodTypeAny, shorts: Record<string, string>): AnyProcedure {
  return createProcedure()
    .path(path)
    .input(zodAdapter(schema))
    .output(outputSchema<unknown>())
    .meta({ shorts })
    .handler(async () => ({}))
    .build() as unknown as AnyProcedure;
}

describe("findFlagNotices", () => {
  it("reports short letters and field names of the global flags", () => {
    const notices = findFlagNotices([
      procedure(["docker", "compose", "down"], z.object({ volumes: z.boolean() }), { volumes: "v" }),
      procedure(["docker", "ps"], z.object({ format: z.string() }), { format: "F" }),
      procedure(["vite", "dev"], z.object({ host: z.string(), port: z.number() }), { host: "h", port: "p" }),
    ]);
    expect(notices).toEqual([
      { procedure: "docker compose down", flag: "-v (volumes)", global: "-v (--version)" },
      { procedure: "docker ps", flag: "--format", global: "--format" },
      { procedure: "vite dev", flag: "-h (host)", global: "-h (--help)" },
    ]);
  });

  it("does not report the server options or flags that hide nothing", () => {
    expect(
      findFlagNotices([procedure(["server", "start"], z.object({ port: z.number(), cwd: z.string() }), { cwd: "C" })])
    ).toEqual([]);
  });
});
