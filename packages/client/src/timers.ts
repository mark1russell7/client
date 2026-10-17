/**
 * The timer settings of the core, as data (roadmap R34).
 *
 * Each default time of the middleware, the transports and the server comes from this object, so
 * a tool can read the settings without a call. `@procedures/systems` binds them to the symbols of
 * the timer law of `systems`, and examines rules such as "the time of one try is less than the
 * request time of the WebSocket". The values are milliseconds. The options of an application
 * are Durations (roadmap R11), and they replace these values.
 */

/** The default times of the core, in milliseconds. */
export interface TimerDefaults {
  readonly retry: {
    /** The tries after the first one. */
    readonly maxRetries: number;
    readonly retryDelayMs: number;
    readonly backoffMultiplier: number;
    /** The longest backoff. Infinity: no limit. */
    readonly maxDelayMs: number;
  };
  readonly circuitBreaker: {
    readonly failureWindowMs: number;
    readonly resetTimeoutMs: number;
  };
  readonly cache: {
    readonly ttlMs: number;
    readonly statsIntervalMs: number;
  };
  readonly rateLimit: {
    readonly windowMs: number;
  };
  readonly webSocketClient: {
    /** The time of the handshake. */
    readonly connectionTimeoutMs: number;
    /** The time until the first frame of a call. */
    readonly requestTimeoutMs: number;
    readonly heartbeatIntervalMs: number;
    readonly heartbeatTimeoutMs: number;
    /** The pongs that can go missing, one after the other, before the connection closes. */
    readonly heartbeatMisses: number;
    readonly reconnectInitialDelayMs: number;
    readonly reconnectMaxDelayMs: number;
  };
  readonly webSocketServer: {
    readonly heartbeatIntervalMs: number;
    readonly heartbeatMisses: number;
    /** The time until the first frame of a call of the server to a client. */
    readonly reverseRequestTimeoutMs: number;
  };
  readonly httpServer: {
    /** The quiet time of an NDJSON stream. After it, the server writes a keep-alive line. */
    readonly keepAliveMs: number;
  };
  readonly idempotency: {
    /** The time that the server keeps the result of a keyed write. */
    readonly ttlMs: number;
  };
  readonly server: {
    /** The time that `ProcedureServer.stop()` waits for the calls that run. */
    readonly stopGraceMs: number;
  };
}

/** The default times of the core. The middleware, the transports and the server read them. */
export const TIMER_DEFAULTS: TimerDefaults = Object.freeze({
  retry: Object.freeze({ maxRetries: 3, retryDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: Number.POSITIVE_INFINITY }),
  circuitBreaker: Object.freeze({ failureWindowMs: 10_000, resetTimeoutMs: 30_000 }),
  cache: Object.freeze({ ttlMs: 60_000, statsIntervalMs: 60_000 }),
  rateLimit: Object.freeze({ windowMs: 60_000 }),
  webSocketClient: Object.freeze({
    connectionTimeoutMs: 10_000,
    requestTimeoutMs: 30_000,
    // 20 s: with the pong timeout of 5 s, the client finds a dead connection after 25 s, before a
    // call on it reaches the request time of 30 s. Before, 30 s gave 35 s (the timer law, R34).
    heartbeatIntervalMs: 20_000,
    heartbeatTimeoutMs: 5_000,
    heartbeatMisses: 1,
    reconnectInitialDelayMs: 1_000,
    reconnectMaxDelayMs: 30_000,
  }),
  // 15 s: with 2 misses, the server finds a dead client after 30 s, not later than a call of the
  // server to it reaches its request time of 30 s. Before, 30 s gave 60 s (the timer law, R34).
  webSocketServer: Object.freeze({ heartbeatIntervalMs: 15_000, heartbeatMisses: 2, reverseRequestTimeoutMs: 30_000 }),
  // 15 s: less than the idle time of 60 s that many proxies and load balancers use. A quiet NDJSON
  // stream then stays open (WIRE-PROTOCOL.md, "The keep-alive of an NDJSON stream").
  httpServer: Object.freeze({ keepAliveMs: 15_000 }),
  idempotency: Object.freeze({ ttlMs: 10 * 60_000 }),
  server: Object.freeze({ stopGraceMs: 0 }),
});
