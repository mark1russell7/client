/**
 * The worker of the call's journey: it runs `runJourney` away from the page, so the page loads no
 * copy of the client runtime for it.
 */

import { runJourney, type Host, type Journey } from "./journey";

export type JourneyRequest = { id: number; host: Host };
export type JourneyMessage = { id: number; journey: Journey };

const port = self as unknown as {
  postMessage(message: JourneyMessage): void;
  onmessage: ((event: MessageEvent<JourneyRequest>) => void) | null;
};

port.onmessage = (event) => {
  const { id, host } = event.data;
  void runJourney(host).then((journey) => port.postMessage({ id, journey }));
};
