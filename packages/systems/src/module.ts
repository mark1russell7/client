/**
 * The procedures of @procedures/systems as data. Importing this file registers nothing.
 *
 * Scaffold a procedure with: mark procedure new <name> --path packages/systems
 */

import { z } from "zod";
import { defineModule, registerModules, PROCEDURE_REGISTRY, PURE_EFFECTS, type ProcedureModule, type ProcedureRegistry, createProcedure } from "@procedures/client";
import { systemsTimers } from "./procedures/systems/timers.js";
import type { SystemsTimersInput, SystemsTimersOutput } from "./types.js";

/** A time in milliseconds: the wire carries times in milliseconds (roadmap R11). */
const milliseconds = (description: string) => z.number().min(0).optional().describe(`${description}, in milliseconds`);

const SystemsTimersInputSchema = z.object({
  perAttemptMs: milliseconds("The time of one try (resilience perAttempt)"),
  overallMs: milliseconds("The time of a call with its retries (resilience overall)"),
  retry: z
    .object({
      maxRetries: z.number().int().min(0).optional().describe("The tries after the first one"),
      retryDelayMs: milliseconds("The first backoff"),
      backoffMultiplier: z.number().min(1).optional().describe("The factor of each next backoff"),
      maxDelayMs: milliseconds("The longest backoff"),
    })
    .optional()
    .describe("The settings of the retry"),
  circuitBreaker: z.object({ resetTimeoutMs: milliseconds("The time that the breaker stays open") }).optional().describe("The settings of the circuit breaker"),
  webSocketClient: z
    .object({
      requestTimeoutMs: milliseconds("The time until the first frame of a call"),
      heartbeatIntervalMs: milliseconds("The time between two pings"),
      heartbeatTimeoutMs: milliseconds("The time that the client waits for a pong"),
      heartbeatMisses: z.number().int().min(1).optional().describe("The pongs that can go missing before the connection closes"),
    })
    .optional()
    .describe("The settings of the WebSocket client"),
  webSocketServer: z
    .object({
      heartbeatIntervalMs: milliseconds("The time between two pings of the server"),
      heartbeatMisses: z.number().int().min(1).optional().describe("The pongs that can go missing before the server closes the connection"),
      reverseRequestTimeoutMs: milliseconds("The time until the first frame of a call of the server to a client"),
    })
    .optional()
    .describe("The settings of the WebSocket server"),
  idempotencyTtlMs: milliseconds("The time that the server keeps the result of a keyed write"),
});

const SystemsTimersOutputSchema = z.object({
  ok: z.boolean().describe("True when no rule is violated"),
  findings: z
    .array(
      z.object({
        rule: z.string().describe("The id of the rule"),
        verdict: z.enum(["holds", "violated", "unbounded", "depends"]).describe("The verdict of the rule"),
        statement: z.string().describe("The rule in words"),
        window: z.string().optional().describe("What goes wrong when the rule is violated"),
        evaluated: z
          .array(
            z.object({
              lhs: z.number().nullable().describe("The left side, in seconds"),
              rhs: z.number().nullable().describe("The right side, in seconds"),
              margin: z.number().describe("The margin, in seconds"),
              holds: z.boolean().nullable().describe("True when the inequality holds. Null: a symbol has no value."),
            }),
          )
          .describe("Each inequality of the rule"),
        unbound: z.array(z.string()).describe("The symbols without a value"),
      }),
    )
    .describe("The verdict of each rule"),
});

const systemsTimersProcedure = createProcedure()
  .path(["systems","timers"])
  .input(SystemsTimersInputSchema)
  .output(SystemsTimersOutputSchema)
  .meta({
    description: "The verdicts of the timer law for the timer settings of an application",
    args: [],
    shorts: {},
    output: "json",
    // It reads only its input, and changes nothing
    effects: PURE_EFFECTS,
  })
  .handler(async (input: SystemsTimersInput): Promise<SystemsTimersOutput> => systemsTimers(input))
  .build();

export const systemsModule: ProcedureModule = defineModule("@procedures/systems", [systemsTimersProcedure]);

export default systemsModule;

/**
 * This function registers the procedures of @procedures/systems in a registry. The default is the
 * global registry.
 */
export function registerSystemsProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [systemsModule]);
}
