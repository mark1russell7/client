/**
 * The faces of a procedure host run the transport contract (roadmap CLI-85): the cases of
 * `@procedures/client/testing` go through the HTTP, WebSocket and MCP faces of
 * one listener of `createProcedureHost`, as a peer serves them. The policy of the host carries the
 * token, the request hook and the events, and `serverOptions` carries the error policy.
 *
 * The retryable flag of an in-band end on each face of the host (CLI-58, CLI-68) is a case of the
 * suite. The HTTP status of the wire is in `client/src/server/in-band-retryable.test.ts`.
 */

import { describe, it, expect, afterEach } from "vitest";
import { WebSocketTransport, HttpTransport, hostPolicy, ms, seconds } from "@procedures/client";
import { service, type Lifecycle, type ServiceBuilder } from "@mark1russell7/service";
import { fakeProcess } from "@mark1russell7/service/testing";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mcpFace } from "@procedures/mcp-server";
import { createProcedureHost, LOCAL_LISTENER_KNOBS } from "./index.js";
import {
  mcpCaller,
  clientCaller,
  describeTransportContract,
  type ContractCaller,
  type ContractCapabilities,
  type ContractFace,
  type ContractServer,
  type ContractSpec,
} from "@procedures/client/testing";

/** A service with short stages, as in `drain-cut.test.ts`. */
function serviceOf(name: string): ServiceBuilder {
  return service(name)
    .readiness({ type: "debounce", interval: seconds(5), failAfter: 3, recoverAfter: 1 })
    .liveness({ type: "window", failAfter: seconds(45) })
    .startup(seconds(10))
    .phase("fail readiness", ms(10))
    .phase("stop intake", ms(500))
    .phase("drain", ms(1000))
    .phase("close transports", ms(500))
    .phase("stop the poller", ms(100))
    .phase("tear down dependencies", ms(500))
    .phase("close the health server", ms(100))
    .cooperativeWindow(ms(500))
    .onRepeatSignal("ignore");
}

type FaceType = "http" | "websocket" | "mcp";

/**
 * A host of the spec with the three faces on one listener, and a caller of one face. The host
 * serves the storages of the spec. Their procedures are in the registry of the spec.
 */
async function hostOf(spec: ContractSpec, type: FaceType, connect: (address: string, bearer: string | undefined) => ContractCaller): Promise<ContractServer> {
  const name = "transport-contract";
  const limit = spec.sizeLimit;
  const host = createProcedureHost({
    name,
    registry: spec.registry,
    policy: hostPolicy({
      events: spec.events,
      ...(spec.token !== undefined && { token: spec.token }),
      ...(spec.principalOf !== undefined && { principalOf: spec.principalOf }),
    }),
    serverOptions: {
      ...(spec.errors !== undefined && { errors: spec.errors }),
      ...(spec.onError !== undefined && { onError: spec.onError }),
    },
    collections: Object.fromEntries(Object.entries(spec.collections).map(([collection, storage]) => [collection, { storage, procedures: false }])),
    faces: {
      http: limit === undefined ? true : { bodyLimit: limit },
      ws: limit === undefined ? true : { maxPayload: limit },
      mcp: mcpFace({ serverInfo: { name, version: "0.0.0" }, ...(limit !== undefined && { maxBodyBytes: limit }) }),
    },
    listen: [{ port: 0, knobs: LOCAL_LISTENER_KNOBS }],
  });
  const life: Lifecycle = await host.declare(serviceOf(name)).run({ process: fakeProcess() });
  const callers: ContractCaller[] = [];
  return {
    async connect(bearer) {
      const caller = connect(host.info.endpoints().find((endpoint) => endpoint.type === type)!.address, bearer);
      callers.push(caller);
      return caller;
    },
    async stop() {
      for (const caller of callers) await caller.close?.().catch(() => undefined);
      for (const part of [...host.parts].reverse()) await part.impl.close();
      await life.shutdown("the test ended");
      await life.done;
    },
  };
}

/** A caller of the HTTP face: the address is the base URL of the procedures. */
const httpConnect = (address: string, bearer: string | undefined) =>
  clientCaller(new HttpTransport({ baseUrl: address, defaultHeaders: bearer === undefined ? {} : { Authorization: `Bearer ${bearer}` } }));

/** A caller of the WebSocket face, with the token in the query. */
const wsConnect = (address: string, bearer: string | undefined) => {
  const url = new URL(address);
  if (bearer !== undefined) url.searchParams.set("token", bearer);
  const transport = new WebSocketTransport({ url: url.toString(), heartbeat: { enabled: false }, reconnect: { enabled: false } });
  return clientCaller(transport, () => transport.close());
};

/** A caller of the MCP face over Streamable HTTP, with the token in the header. */
const mcpConnect = (address: string, bearer: string | undefined) =>
  mcpCaller(async () => {
    const client = new McpClient({ name: "contract", version: "0" });
    // The SDK types do not agree with exactOptionalPropertyTypes
    await client.connect(new StreamableHTTPClientTransport(new URL(address), { requestInit: { headers: bearer === undefined ? {} : { authorization: `Bearer ${bearer}` } } }) as never);
    return client;
  });

const NETWORK: ContractCapabilities = { server: true, auth: true, subscriptions: true, streams: "items", deadline: true, errorMetadata: true, retryable: true, sizeLimit: { code: "PAYLOAD_TOO_LARGE" } };

const faces: ContractFace[] = [
  { name: "the HTTP face of a host", capabilities: NETWORK, start: (spec) => hostOf(spec, "http", httpConnect) },
  // The face checks the token at the upgrade: no idle connection without credentials stays open
  { name: "the WebSocket face of a host", capabilities: { ...NETWORK, authRefusal: "connect" }, start: (spec) => hostOf(spec, "websocket", wsConnect) },
  {
    name: "the MCP face of a host",
    // An MCP tool call is one result: no subscription, no cancel of a stream, no deadline of the caller and no error metadata
    capabilities: { ...NETWORK, subscriptions: false, streams: "collected", deadline: false, errorMetadata: false },
    start: (spec) => hostOf(spec, "mcp", mcpConnect),
  },
];

for (const face of faces) describeTransportContract(face, { describe, it, afterEach, expect });
