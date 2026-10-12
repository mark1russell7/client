/**
 * The page side of the call's journey. It asks the worker for the journey of a host. Without a
 * Web Worker (an old browser), it runs the journey on the page.
 */

import type { Host, Journey } from "./journey-info";
import type { JourneyMessage, JourneyRequest } from "./journey-worker";

export class JourneyClient {
  private worker: Worker | null = null;
  private nextId = 0;
  private readonly waiting = new Map<number, (journey: Journey) => void>();

  private spawn(): Worker | null {
    if (typeof Worker === "undefined") return null;
    try {
      const worker = new Worker(new URL("./journey-worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<JourneyMessage>) => {
        const finish = this.waiting.get(event.data.id);
        this.waiting.delete(event.data.id);
        finish?.(event.data.journey);
      };
      return worker;
    } catch {
      return null;
    }
  }

  /** This function gives the journey of one call over a host. */
  async run(host: Host): Promise<Journey> {
    const worker = (this.worker ??= this.spawn());
    if (!worker) {
      const { runJourney } = await import("./journey");
      return runJourney(host);
    }
    const id = ++this.nextId;
    return new Promise<Journey>((resolve) => {
      this.waiting.set(id, resolve);
      worker.postMessage({ id, host } satisfies JourneyRequest);
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.waiting.clear();
  }
}
