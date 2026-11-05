/**
 * The live state on a host, over a real WebSocket (LIVE-STATE-2026-11.md). A key ends at the close
 * of the connection of its owner, and a new reader sees the live values at once.
 */
import { describe, it, expect, afterEach } from "vitest";
import { service, type Lifecycle, type ServiceBuilder } from "@mark1russell7/service";
import { fakeProcess } from "@mark1russell7/service/testing";
import { Client, WebSocketTransport, createEventBus, createRegistry, hostPolicy, liveTopic, liveView, ms, seconds, type LiveEvent } from "@procedures/client";
import { createProcedureHost, LOCAL_LISTENER_KNOBS } from "./index.js";

let cleanups: Array<() => Promise<unknown> | unknown> = [];
const lives: Lifecycle[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  for (const life of lives.splice(0)) {
    await life.shutdown("the test ended");
    await life.done;
  }
});

/** A service with short stages. */
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

/** A host with a WebSocket face and a live state, and a function that opens a client of the face. */
async function runHost(name: string) {
  const bus = createEventBus();
  const host = createProcedureHost({
    name,
    registry: createRegistry(),
    policy: hostPolicy({ events: { bus, topics: ["live.*"], live: { expiresAfter: seconds(300), admitSet: () => ({ by: "the host" }), window: ms(0) } } }),
    faces: { http: true, ws: true },
    listen: [{ port: 0, knobs: LOCAL_LISTENER_KNOBS }],
  });
  const life = await host.declare(serviceOf(name)).run({ process: fakeProcess() });
  lives.push(life);
  const url = host.info.endpoints().find((endpoint) => endpoint.type === "websocket")!.address;
  const open = () => {
    const transport = new WebSocketTransport({ url, heartbeat: { enabled: false }, reconnect: { enabled: false } });
    cleanups.push(() => transport.close());
    return { transport, client: new Client({ transport, throwOnError: true }) };
  };
  return { bus, open };
}

/** This function waits for the next event of a topic on the bus of the host. */
function nextEvent(bus: ReturnType<typeof createEventBus>, topic: string): Promise<LiveEvent> {
  return new Promise((resolve) => {
    const stop = bus.on<LiveEvent>(topic, (event) => {
      stop();
      resolve(event);
    });
  });
}

const SET = { service: "live", operation: "set" };

describe("a live state on a host", () => {
  it("ends the keys of a connection at its close, and a reader gets the gone", async () => {
    const { bus, open } = await runHost("live-close");
    const topic = liveTopic("room");
    const writer = open();
    await writer.client.call(SET, { topic, key: "ann", value: { x: 1 } });

    const reader = open();
    const view = liveView<{ x: number }>(reader.client, topic);
    await view.ready;
    expect([...view.values.values()]).toMatchObject([{ key: "ann", value: { x: 1 }, by: "the host" }]);

    const gone = nextEvent(bus, topic);
    await writer.transport.close();
    expect((await gone).gone).toEqual([{ key: "ann", reason: "closed" }]);
    await expect.poll(() => view.values.size).toBe(0);
    view.close();
  });

  it("keeps the keys of a connection that stays open", async () => {
    const { bus, open } = await runHost("live-open");
    const topic = liveTopic("room");
    const stays = open();
    const leaves = open();
    await stays.client.call(SET, { topic, key: "stays", value: 1 });
    await leaves.client.call(SET, { topic, key: "leaves", value: 1 });
    const gone = nextEvent(bus, topic);
    await leaves.transport.close();
    expect((await gone).gone).toEqual([{ key: "leaves", reason: "closed" }]);

    const { entries } = await stays.client.call<{ topic: string }, { entries: Array<{ key: string }> }>({ service: "live", operation: "snapshot" }, { topic });
    expect(entries.map(({ key }) => key)).toEqual(["stays"]);
  });

  it("delivers the set of a second client to a subscriber over the socket", async () => {
    const { open } = await runHost("live-deliver");
    const topic = liveTopic("room");
    const reader = open();
    const view = liveView<number>(reader.client, topic);
    await view.ready;
    const writer = open();
    await writer.client.call(SET, { topic, key: "bob", value: 7 });
    await expect.poll(() => view.values.get("bob")?.value).toBe(7);
    view.close();
  });
});
