/**
 * The page side of the call's journey. It calls the procedure `site.journey` of the worker over a
 * `PortTransport` (roadmap R27). Without a Web Worker (an old browser), it runs the journey on
 * the page.
 */

import { PortTransport } from "@procedures/client/browser";
import type { Host, Journey } from "./journey-info";
import type { JourneyInput } from "./journey-worker";

export class JourneyClient {
  private worker: { worker: Worker; transport: PortTransport } | null = null;
  private nextId = 0;

  private spawn(): { worker: Worker; transport: PortTransport } | null {
    if (typeof Worker === "undefined") return null;
    try {
      const worker = new Worker(new URL("./journey-worker.ts", import.meta.url), { type: "module" });
      return { worker, transport: new PortTransport(worker) };
    } catch {
      return null;
    }
  }

  /** This function gives the journey of one call over a host. */
  async run(host: Host): Promise<Journey> {
    const spawned = (this.worker ??= this.spawn());
    if (!spawned) {
      const { runJourney } = await import("./journey");
      return runJourney(host);
    }
    const message = { id: String(++this.nextId), method: { service: "site", operation: "journey" }, payload: { host } satisfies JourneyInput, metadata: {} };
    for await (const item of spawned.transport.send<JourneyInput, Journey>(message)) {
      if (item.status.type === "error") throw new Error(item.status.message);
      return item.payload;
    }
    throw new Error("The journey worker sent no answer");
  }

  dispose(): void {
    if (this.worker) {
      this.worker.worker.terminate();
      void this.worker.transport.close();
    }
    this.worker = null;
  }
}
