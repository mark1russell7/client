/**
 * The procedures of a host (roadmap R19): `host.health`, `host.info` and `host.metrics`.
 *
 * Before, a peer gave its health only as an Express route (`/health`), and the counts of
 * `metricsInterceptor` had no way out. A host pins these procedures on its `ProcedureServer`
 * (`registerProcedure`), so they do not change the registry that the host serves. A call needs
 * the token of the host, as each other call does. The `/health` route stays for the checks
 * that have no token.
 */

import { z } from "zod";
import { createProcedure } from "../procedures/define.js";
import { PURE_EFFECTS } from "../procedures/effects.js";
import type { AnyProcedure } from "../procedures/types.js";
import type { MetricsInterceptor } from "../procedures/interceptors.js";
import type { ProcedureServer } from "./procedure-server.js";

/** What a host tells about itself. */
export interface HostSource {
  /** The id of the host (the peer id). */
  readonly id: string;
  /** The time at which the host started, from `Date.now()`. */
  readonly startedAt: number;
  /** The server of the host. */
  readonly server: ProcedureServer;
  /** The endpoints of the host, when it has network transports. */
  readonly endpoints?: (() => ReadonlyArray<{ type: string; address: string }>) | undefined;
  /** The metrics interceptor of the host, when it counts its calls. */
  readonly metrics?: MetricsInterceptor | undefined;
}

const healthOutput = z.object({
  status: z.enum(["ok", "stopping"]).describe("ok, or stopping while the host waits for its calls in flight"),
  uptimeMs: z.number().describe("The time since the start of the host, in milliseconds"),
  procedures: z.number().describe("The number of procedures that the host serves"),
  callsInFlight: z.number().describe("The calls that run now, streams included"),
  peerId: z.string().describe("The id of the host"),
});

const infoOutput = z.object({
  peerId: z.string().describe("The id of the host"),
  startedAt: z.string().describe("The start time of the host (ISO 8601)"),
  endpoints: z.array(z.object({ type: z.string(), address: z.string() })).describe("The network endpoints of the host"),
  runtime: z.string().describe("The runtime of the host, for example node 24.1.0"),
});

const metricsOutput = z.object({
  procedures: z
    .record(
      z.string(),
      z.object({ calls: z.number(), errors: z.number(), totalMs: z.number(), maxMs: z.number() }),
    )
    .describe("The calls, the errors and the time of each procedure since the start, by key"),
});

/** The runtime of this process: its name and version. */
function runtimeOf(): string {
  const process = (globalThis as { process?: { versions?: { node?: string } } }).process;
  if (process?.versions?.node) return `node ${process.versions.node}`;
  const navigator = (globalThis as { navigator?: { userAgent?: string } }).navigator;
  return navigator?.userAgent ?? "unknown";
}

/** This function gives the procedures of a host: `host.health`, `host.info` and `host.metrics`. */
export function hostProcedures(source: HostSource): AnyProcedure[] {
  const health = createProcedure()
    .path(["host", "health"])
    .input(z.object({}))
    .output(healthOutput)
    .meta({ description: "The health of the host: its state, its uptime and its calls in flight", effects: PURE_EFFECTS })
    .handler(async () => ({
      status: source.server.stopping ? ("stopping" as const) : ("ok" as const),
      uptimeMs: Date.now() - source.startedAt,
      procedures: source.server.procedureCount,
      callsInFlight: source.server.callsInFlight,
      peerId: source.id,
    }))
    .build();

  const info = createProcedure()
    .path(["host", "info"])
    .input(z.object({}))
    .output(infoOutput)
    .meta({ description: "The identity of the host: its id, its start time, its endpoints and its runtime", effects: PURE_EFFECTS })
    .handler(async () => ({
      peerId: source.id,
      startedAt: new Date(source.startedAt).toISOString(),
      endpoints: [...(source.endpoints?.() ?? [])],
      runtime: runtimeOf(),
    }))
    .build();

  const metrics = createProcedure()
    .path(["host", "metrics"])
    .input(z.object({}))
    .output(metricsOutput)
    .meta({ description: "The calls, the errors and the time of each procedure since the start of the host", effects: PURE_EFFECTS })
    .handler(async () => ({ procedures: source.metrics?.snapshot() ?? {} }))
    .build();

  return [health, info, metrics] as AnyProcedure[];
}
