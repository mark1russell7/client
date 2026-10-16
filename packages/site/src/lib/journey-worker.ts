/**
 * The worker of the call's journey: it runs `runJourney` away from the page, so the page loads no
 * copy of the client runtime for it.
 *
 * The worker serves the procedure `site.journey` over a `PortTransport` of `@procedures/client`
 * (roadmap R27). Before, the page and the worker had a protocol of their own.
 */

import { PortTransport, type RequestHandler, type ServerResponse } from "@procedures/client/browser";
import { runJourney, type Host } from "./journey";

/** The input of `site.journey`. */
export type JourneyInput = { host: Host };

const journeys: RequestHandler = {
  async handle(request): Promise<ServerResponse> {
    if (request.method.service !== "site" || request.method.operation !== "journey") {
      return { id: request.id, status: { type: "error", code: "NOT_FOUND", message: "This worker serves only site.journey", retryable: false }, metadata: {} };
    }
    const journey = await runJourney((request.payload as JourneyInput).host);
    return { id: request.id, status: { type: "success", code: 200 }, payload: journey, metadata: {} };
  },
};

new PortTransport(self, { serve: journeys });
