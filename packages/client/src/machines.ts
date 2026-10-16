/**
 * The state machines of the core as data (roadmap R35): the connection of the WebSocket client
 * and the circuit breaker. The documents have the format `mark1russell7.machine/1` of
 * `@mark1russell7/algebra`. They are the specification, and the code implements them. Their knobs
 * are the default times of the core (`TIMER_DEFAULTS`), and their timers say which knob gives each
 * wait.
 *
 * The code reports each change of its state as a `MachineTransition` (the option `onTransition`).
 * `replayTransitions()` replays the reports of a run against a document, so a test finds each
 * change that the document does not allow. It uses `replay` of `@mark1russell7/algebra/replay`
 * (roadmap R37). That entry imports nothing else, and it has 418 bytes of gzip.
 */

import { replay } from "@mark1russell7/algebra/replay";
import { TIMER_DEFAULTS } from "./timers.js";

/** A change of state that the code reports. It has the fields of a lifecycle event of `@mark1russell7/service`. */
export interface MachineTransition {
  /** The id of the document. */
  readonly machine: string;
  /** The instance: one connection, one breaker. */
  readonly instance: string;
  readonly from: string;
  readonly on: string;
  readonly to: string;
  /** The time of the clock of the instance, in milliseconds. */
  readonly at: number;
}

/** A time of a timer: one knob, in a unit. */
export interface MachineDuration {
  readonly knob: string;
  readonly unit: string;
}

/** A timer of a document: the events that start and stop it, and the event that it gives. */
export interface MachineTimer {
  readonly duration: MachineDuration;
  readonly arms: readonly string[];
  readonly cancels?: readonly string[] | undefined;
  readonly fires: string;
  /** A timer that starts again after it fires, with a longer wait each time. */
  readonly backoff?: { readonly resets: readonly string[] } | undefined;
  readonly note?: string | undefined;
}

/** A transition of a document. */
export interface MachineTransitionDef {
  readonly id: string;
  readonly from: string | readonly string[];
  readonly on: string | readonly string[];
  readonly to: string;
  readonly timer?: string | undefined;
  readonly note?: string | undefined;
}

/** A machine document: the subset of `mark1russell7.machine/1` that the core uses. */
export interface MachineDocument {
  readonly format: "mark1russell7.machine/1";
  readonly id: string;
  readonly title: string;
  readonly layer: "self";
  readonly version: string;
  readonly sources: ReadonlyArray<{ readonly ref: string; readonly rung: "implemented" }>;
  readonly states: Readonly<Record<string, { readonly initial?: boolean; readonly final?: boolean; readonly note?: string }>>;
  readonly events: Readonly<Record<string, { readonly kind: "rx" | "tx" | "app" | "timer" | "local"; readonly note?: string }>>;
  readonly knobs: Readonly<Record<string, { readonly key: string; readonly scope: string; readonly unit: string | null; readonly default: number | null }>>;
  readonly timers: Readonly<Record<string, MachineTimer>>;
  readonly transitions: readonly MachineTransitionDef[];
}

const SOURCE = [{ ref: "packages/client/src (the core implements this document)", rung: "implemented" as const }];
const ms = (knob: string): MachineDuration => ({ knob, unit: "ms" });
const client = TIMER_DEFAULTS.webSocketClient;

/** The connection of the WebSocket client (`WebSocketTransport`). */
export const WEBSOCKET_CONNECTION_MACHINE: MachineDocument = {
  format: "mark1russell7.machine/1",
  id: "procedures.machine.websocket-connection",
  title: "The connection of the WebSocket client",
  layer: "self",
  version: "0.2.3",
  sources: SOURCE,
  states: {
    DISCONNECTED: { initial: true, note: "no socket" },
    CONNECTING: { note: "the handshake, with its time limit" },
    CONNECTED: { note: "the calls and the heartbeat" },
    RECONNECTING: { note: "the backoff before the next try" },
    DISCONNECTING: { note: "close() ends the socket and the calls" },
  },
  events: {
    connect: { kind: "app", note: "the transport starts" },
    "reconnect-due": { kind: "timer" },
    open: { kind: "rx", note: "the handshake ends" },
    drop: { kind: "local", note: "the socket closes, or an error ends it" },
    "handshake-timeout": { kind: "timer" },
    "ping-due": { kind: "timer" },
    pong: { kind: "rx" },
    "pong-timeout": { kind: "timer", note: "a drop after the last allowed miss" },
    "give-up": { kind: "local", note: "a drop without reconnect, or without tries left" },
    close: { kind: "app", note: "close() of the application" },
    closed: { kind: "local" },
  },
  knobs: {
    connection_timeout: { key: "connectionTimeout", scope: "client", unit: "ms", default: client.connectionTimeoutMs },
    request_timeout: { key: "requestTimeout", scope: "client", unit: "ms", default: client.requestTimeoutMs },
    heartbeat_interval: { key: "heartbeat.interval", scope: "client", unit: "ms", default: client.heartbeatIntervalMs },
    heartbeat_timeout: { key: "heartbeat.timeout", scope: "client", unit: "ms", default: client.heartbeatTimeoutMs },
    heartbeat_misses: { key: "heartbeat.misses", scope: "client", unit: "count", default: client.heartbeatMisses },
    reconnect_initial_delay: { key: "reconnect.initialDelay", scope: "client", unit: "ms", default: client.reconnectInitialDelayMs },
    reconnect_max_delay: { key: "reconnect.maxDelay", scope: "client", unit: "ms", default: client.reconnectMaxDelayMs },
  },
  timers: {
    handshake: { duration: ms("connection_timeout"), arms: ["enter:CONNECTING"], cancels: ["open", "drop", "close"], fires: "handshake-timeout" },
    reconnect: {
      duration: ms("reconnect_max_delay"),
      arms: ["enter:RECONNECTING"],
      cancels: ["close"],
      fires: "reconnect-due",
      backoff: { resets: ["open"] },
      note: "the longest wait: try n waits a random time up to min(maxDelay, initialDelay × 2^(n-1))",
    },
    ping: { duration: ms("heartbeat_interval"), arms: ["enter:CONNECTED", "ping-due"], cancels: ["drop", "close"], fires: "ping-due" },
    pong: { duration: ms("heartbeat_timeout"), arms: ["ping-due"], cancels: ["pong", "drop", "close"], fires: "pong-timeout" },
  },
  transitions: [
    { id: "connect", from: "DISCONNECTED", on: "connect", to: "CONNECTING" },
    { id: "reconnect", from: "RECONNECTING", on: "reconnect-due", to: "CONNECTING", timer: "reconnect" },
    { id: "open", from: "CONNECTING", on: "open", to: "CONNECTED" },
    {
      id: "drop",
      from: ["CONNECTING", "CONNECTED", "RECONNECTING"],
      on: ["drop", "handshake-timeout", "pong-timeout"],
      to: "RECONNECTING",
      note: "the code reports each of them as drop",
    },
    { id: "give-up", from: ["CONNECTING", "CONNECTED", "RECONNECTING"], on: "give-up", to: "DISCONNECTED" },
    { id: "close", from: ["DISCONNECTED", "CONNECTING", "CONNECTED", "RECONNECTING"], on: "close", to: "DISCONNECTING" },
    { id: "closed", from: "DISCONNECTING", on: "closed", to: "DISCONNECTED" },
  ],
};

/** The circuit breaker (`createCircuitBreakerMiddleware`). */
export const CIRCUIT_BREAKER_MACHINE: MachineDocument = {
  format: "mark1russell7.machine/1",
  id: "procedures.machine.circuit-breaker",
  title: "The circuit breaker",
  layer: "self",
  version: "0.2.3",
  sources: SOURCE,
  states: {
    CLOSED: { initial: true, note: "each call goes through. The window counts the failures of availability." },
    OPEN: { note: "each call fails at once, until the reset time" },
    HALF_OPEN: { note: "a limited number of probes go through" },
  },
  events: {
    "failure-threshold": { kind: "local", note: "the window has the threshold of failures" },
    "reset-timeout": { kind: "timer" },
    "probe-failure": { kind: "local" },
    "probe-successes": { kind: "local", note: "the threshold of successes of the probes" },
  },
  knobs: {
    failure_threshold: { key: "failureThreshold", scope: "client", unit: "count", default: 5 },
    failure_window: { key: "failureWindow", scope: "client", unit: "ms", default: TIMER_DEFAULTS.circuitBreaker.failureWindowMs },
    reset_timeout: { key: "resetTimeout", scope: "client", unit: "ms", default: TIMER_DEFAULTS.circuitBreaker.resetTimeoutMs },
    success_threshold: { key: "successThreshold", scope: "client", unit: "count", default: 2 },
  },
  timers: {
    reset: { duration: ms("reset_timeout"), arms: ["failure-threshold", "probe-failure"], cancels: ["probe-successes"], fires: "reset-timeout" },
  },
  transitions: [
    { id: "trip", from: "CLOSED", on: "failure-threshold", to: "OPEN" },
    { id: "reset", from: "OPEN", on: "reset-timeout", to: "HALF_OPEN", timer: "reset" },
    { id: "reopen", from: "HALF_OPEN", on: "probe-failure", to: "OPEN" },
    { id: "recover", from: "HALF_OPEN", on: "probe-successes", to: "CLOSED" },
  ],
};

/**
 * This function replays the reported transitions of one document. Each instance starts in the
 * state that its first transition leaves. Each transition must leave the state where the replay
 * is, and the document must allow it. The function gives each disagreement.
 */
export function replayTransitions(machine: MachineDocument, events: readonly MachineTransition[]): string[] {
  return replay(machine, events, { machine: machine.id });
}
