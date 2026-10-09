/**
 * Procedures for the unit tests of the CLI. They are built like the procedures of the client
 * packages (a Zod schema through zodAdapter, and CLI metadata), and they do nothing.
 *
 * @internal
 */

import { z } from "zod";
import { createProcedure, outputSchema, zodAdapter, type AnyProcedure } from "@mark1russell7/client";
import type { CLIMeta } from "../src/parse.js";

function procedure(
  path: string[],
  schema: z.ZodTypeAny,
  meta: CLIMeta,
  handler: (input: unknown) => unknown = (input) => input
): AnyProcedure {
  return createProcedure()
    .path(path)
    .input(zodAdapter(schema))
    .output(outputSchema<unknown>())
    .meta(meta as Record<string, unknown>)
    .handler(async (input: unknown) => handler(input))
    .build() as unknown as AnyProcedure;
}

/** The test procedures: docker-like, git-like, fs-like and untyped */
export function testProcedures(): AnyProcedure[] {
  return [
    procedure(
      ["docker", "compose", "down"],
      z.object({ volumes: z.boolean().optional(), file: z.string().optional() }),
      { shorts: { volumes: "v", file: "f" } }
    ),
    procedure(
      ["docker", "exec"],
      z.object({
        container: z.string(),
        command: z.array(z.string()),
        interactive: z.boolean().optional(),
        tty: z.boolean().optional(),
        env: z.record(z.string()).optional(),
      }),
      { args: ["container", "command"], shorts: { interactive: "i", tty: "t" } }
    ),
    procedure(
      ["docker", "ps"],
      z.object({ format: z.string().optional(), all: z.boolean().default(false) }),
      { shorts: { all: "a", format: "F" } }
    ),
    procedure(
      ["vite", "dev"],
      z.object({ host: z.string().optional(), port: z.number().optional() }),
      { shorts: { host: "h", port: "p" } }
    ),
    procedure(
      ["fs", "exists"],
      z.object({ path: z.string() }),
      { args: ["path"] }
    ),
    procedure(
      ["git", "commit"],
      z.object({
        message: z.string().optional(),
        amend: z.boolean().default(false),
        dryRun: z.boolean().default(false),
        count: z.number().optional(),
        data: z.unknown().optional(),
        tags: z.array(z.string()).optional(),
        id: z.union([z.string(), z.number()]).optional(),
        level: z.union([z.number(), z.boolean()]).optional(),
        options: z.object({ a: z.number() }).optional(),
        mode: z.enum(["fast", "slow"]).optional(),
      }),
      { shorts: { message: "m", amend: "A", count: "n", dryRun: "d" } }
    ),
    procedure(
      ["copy"],
      z.object({ sources: z.array(z.string()), dest: z.string() }),
      { args: ["sources", "dest"] }
    ),
    procedure(["result", "ok"], z.object({}), {}, () => ({ success: true })),
    procedure(["result", "fails"], z.object({}), {}, () => ({ success: false, errors: ["it broke"] })),
    procedure(["result", "exit"], z.object({}), {}, () => ({ exitCode: 2, stdout: "" })),
    procedure(["result", "throws"], z.object({}), {}, () => {
      throw new Error("handler error");
    }),
    // A procedure whose schema has no readable fields: its flags pass through
    procedure(["untyped"], z.any(), {}),
  ];
}
