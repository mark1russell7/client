/**
 * The rules of the timer law for the client (roadmap R34), as data in the format of
 * `@mark1russell7/service`. Each rule is one or more linear inequalities over symbols at a hop
 * (`try_timeout@client`). `bindingOf()` gives the values of the symbols from the settings of an
 * application.
 */

import type { Rule } from "@mark1russell7/service";

/** A term of one symbol with the coefficient 1. */
const at = (symbol: string) => {
  const [knob, hop] = symbol.split("@");
  return { knob: knob!, coef: 1, at: hop };
};

/** The rules of the client. */
export const CLIENT_RULES: readonly Rule[] = Object.freeze([
  {
    id: "try-under-transport-timeout",
    rule: "The time of one try is less than the request time of the WebSocket transport.",
    window: "The transport ends the try with its own timeout first. Then the retry sees a transport error, not a TIMEOUT of the try.",
    expr: { lhs: { terms: [at("try_timeout@client")] }, op: "<", rhs: { terms: [at("transport_request_timeout@client")] } },
  },
  {
    id: "overall-covers-retries",
    rule: "The overall time of a call covers each try and each backoff of the retry.",
    window: "The overall timeout ends the call during a backoff or a try, so the last tries never start.",
    expr: { lhs: { terms: [at("overall_timeout@client")] }, op: ">=", rhs: { terms: [at("retry_budget@client")] } },
  },
  {
    id: "keyed-result-outlives-call",
    rule: "The server keeps the result of a keyed write longer than the longest call with its retries.",
    window: "A retry of a keyed write after the end of the time to live runs the write a second time.",
    expr: { lhs: { terms: [at("idempotency_ttl@server")] }, op: ">", rhs: { terms: [at("call_time@client")] } },
  },
  {
    id: "dead-connection-before-request-timeout",
    rule: "The client finds a dead connection before a call on it reaches the request time of the transport.",
    window: "A call on a dead connection fails with a timeout, and the reconnect starts late.",
    expr: { lhs: { terms: [at("heartbeat_detection@client")] }, op: "<", rhs: { terms: [at("transport_request_timeout@client")] } },
  },
  {
    id: "server-finds-dead-client",
    rule: "The server finds a dead client before a call of the server to it reaches its request time.",
    window: "A call of the server to a dead client fails with a timeout, and the server keeps the connection until then.",
    expr: { lhs: { terms: [at("heartbeat_detection@server")] }, op: "<=", rhs: { terms: [at("reverse_request_timeout@server")] } },
  },
  {
    id: "breaker-outlasts-backoff",
    rule: "The circuit breaker stays open longer than the longest backoff of the retry.",
    window: "The retry tries again before the breaker allows a probe, and each try fails at once with the error of the open breaker.",
    expr: { lhs: { terms: [at("breaker_reset@client")] }, op: ">=", rhs: { terms: [at("max_backoff@client")] } },
  },
] satisfies Rule[]);
