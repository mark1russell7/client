/**
 * A peer runs the lifecycle of its own service on `embeddedProcess()` of `@mark1russell7/service`
 * (CLI-7, SYS-27). The port installs no handler of a signal, and it never holds or ends the process.
 * Thus a test or a script that starts a peer keeps its own signals and its own exit.
 */

import { describe, it, expect } from "vitest";
import { ProcedureRegistry } from "@procedures/client";
import { createPeer } from "./index.js";

const EVENTS = ["SIGINT", "SIGTERM", "SIGQUIT"] as const;

/** The count of the handlers of each signal of the process. */
function handlers(): Record<string, number> {
  return Object.fromEntries(EVENTS.map((event) => [event, process.listenerCount(event)]));
}

describe("the lifecycle of a peer (CLI-7, SYS-27)", () => {
  it("installs no signal handler at its start, and stop() leaves the process without one", async () => {
    const before = handlers();
    const peer = await createPeer({ id: "peer-lifecycle", registry: new ProcedureRegistry(), transports: [{ type: "http", port: 0, host: "127.0.0.1" }] });
    await peer.start();
    expect(peer.getEndpoints()).toHaveLength(1);
    expect(handlers()).toEqual(before);
    await peer.stop();
    expect(handlers()).toEqual(before);
    expect(peer.getEndpoints()).toEqual([]);
  });
});
