/**
 * The middleware lab: the real client middlewares around a server that the page simulates.
 * Change the layers and their order, inject faults, send requests, and watch each request go
 * through the onion.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Onion, type OnionHandle } from "../components/Onion";
import {
  DEFAULT_FAULTS,
  DEFAULT_SETTINGS,
  LAYER_INFO,
  layersOf,
  type BreakerState,
  type Faults,
  type LabEvent,
  type LabSettings,
  type LayerId,
} from "../lib/lab-info";
// The engine (the client runtime) loads at the first request: the page itself stays small
import type { Lab as LabEngine } from "../lib/lab";

// ---------------------------------------------------------------------------
// The record of each request, for the counters and the timeline
// ---------------------------------------------------------------------------

interface RequestRecord {
  request: number;
  key: string;
  start: number;
  end?: number;
  ok?: boolean;
  code?: string;
  /** The times of the server attempts. */
  attempts: number[];
  items: number;
  /** The layers that answered without the server (a cache hit, a refusal). */
  answeredBy?: string;
}

interface LayerCounts {
  in: number;
  on: number;
  ok: number;
  failed: number;
}

interface Stats {
  sent: number;
  ok: number;
  failed: number;
  serverCalls: number;
  layers: LayerCounts[];
  codes: Record<string, number>;
}

const emptyStats = (layers: number): Stats => ({
  sent: 0,
  ok: 0,
  failed: 0,
  serverCalls: 0,
  layers: Array.from({ length: layers }, () => ({ in: 0, on: 0, ok: 0, failed: 0 })),
  codes: {},
});

const TIMELINE_ROWS = 24;
const KEY_MODES = { one: "One key (the cache can answer)", three: "Three keys", new: "A new key each time" } as const;
type KeyMode = keyof typeof KEY_MODES;

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

interface Scenario {
  id: string;
  title: string;
  text: string;
  settings: Partial<LabSettings>;
  faults: Partial<Faults>;
  keyMode: KeyMode;
  /** The requests to send: the delay of each, in milliseconds. */
  traffic: number[];
  /** Faults that change later, to show a recovery. */
  later?: { at: number; faults: Partial<Faults> };
}

const on = (...ids: LayerId[]): Record<LayerId, boolean> =>
  Object.fromEntries(DEFAULT_SETTINGS.order.map((id) => [id, ids.includes(id)])) as Record<LayerId, boolean>;

const SCENARIOS: Scenario[] = [
  {
    id: "flaky",
    title: "A flaky server",
    text: "Half of the attempts fail. Retry starts each failed attempt again, so most calls succeed.",
    settings: { enabled: on("overall", "retry"), retries: 3, retryDelayMs: 200 },
    faults: { errorRate: 0.5, dead: false, streamItems: 1, latencyMs: 200 },
    keyMode: "new",
    traffic: [0, 350, 700, 1050, 1400, 1750],
  },
  {
    id: "dead",
    title: "A dead peer",
    text: "The server never answers. The attempt timeout ends each attempt, retry tries again, and the whole-call timeout ends the call.",
    settings: { enabled: on("overall", "retry", "attempt"), overallMs: 3000, attemptMs: 700, retries: 2, retryDelayMs: 150, order: ["cache", "overall", "retry", "breaker", "rateLimit", "attempt"] },
    faults: { dead: true, errorRate: 0, streamItems: 1 },
    keyMode: "new",
    traffic: [0, 900],
  },
  {
    id: "outage",
    title: "An outage and a recovery",
    text: "Every attempt fails, so the circuit breaker opens and refuses calls at once. After 6 s the server recovers, and a probe closes the breaker.",
    settings: { enabled: on("breaker"), breakerThreshold: 3, breakerResetMs: 2500 },
    faults: { errorRate: 1, dead: false, streamItems: 1, latencyMs: 150 },
    keyMode: "new",
    traffic: Array.from({ length: 22 }, (_, index) => index * 450),
    later: { at: 6000, faults: { errorRate: 0 } },
  },
  {
    id: "burst",
    title: "A burst",
    text: "Ten requests at once. The rate limit lets three through in each window and queues the others.",
    settings: { enabled: on("rateLimit"), rateMax: 3, rateWindowMs: 1500, rateStrategy: "queue" },
    faults: { errorRate: 0, dead: false, streamItems: 1, latencyMs: 150 },
    keyMode: "new",
    traffic: Array.from({ length: 10 }, () => 0),
  },
  {
    id: "hot",
    title: "A hot key",
    text: "The same key again and again. The first call goes to the slow server. The cache answers the next calls at once.",
    settings: { enabled: on("cache", "overall"), cacheTtlMs: 8000 },
    faults: { errorRate: 0, dead: false, streamItems: 1, latencyMs: 900 },
    keyMode: "one",
    traffic: [0, 1200, 1500, 1800, 2100, 2400],
  },
  {
    id: "stream",
    title: "A slow stream",
    text: "The server sends six items, one each 300 ms. Each item leaves the onion when it arrives, before the end of the call.",
    settings: { enabled: on("overall", "retry"), overallMs: 4000 },
    faults: { errorRate: 0, dead: false, streamItems: 6, streamGapMs: 300, latencyMs: 200 },
    keyMode: "new",
    traffic: [0, 500],
  },
];

// ---------------------------------------------------------------------------
// Parts of the page
// ---------------------------------------------------------------------------

function NumberControl({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}): ReactElement {
  return (
    <label className="lab-number">
      <span className="lab-number-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <output>
        {value}
        {unit ? ` ${unit}` : ""}
      </output>
    </label>
  );
}

function LayerSettings({ id, settings, update }: { id: LayerId; settings: LabSettings; update: (change: Partial<LabSettings>) => void }): ReactElement | null {
  switch (id) {
    case "cache":
      return <NumberControl label="Keep an answer for" value={settings.cacheTtlMs} min={500} max={20000} step={500} unit="ms" onChange={(cacheTtlMs) => update({ cacheTtlMs })} />;
    case "overall":
      return <NumberControl label="End the call after" value={settings.overallMs} min={200} max={10000} step={100} unit="ms" onChange={(overallMs) => update({ overallMs })} />;
    case "retry":
      return (
        <>
          <NumberControl label="Retries" value={settings.retries} min={0} max={5} onChange={(retries) => update({ retries })} />
          <NumberControl label="First backoff" value={settings.retryDelayMs} min={0} max={2000} step={50} unit="ms" onChange={(retryDelayMs) => update({ retryDelayMs })} />
        </>
      );
    case "breaker":
      return (
        <>
          <NumberControl label="Open after failures" value={settings.breakerThreshold} min={1} max={10} onChange={(breakerThreshold) => update({ breakerThreshold })} />
          <NumberControl label="Probe after" value={settings.breakerResetMs} min={500} max={15000} step={500} unit="ms" onChange={(breakerResetMs) => update({ breakerResetMs })} />
        </>
      );
    case "rateLimit":
      return (
        <>
          <NumberControl label="Requests per window" value={settings.rateMax} min={1} max={20} onChange={(rateMax) => update({ rateMax })} />
          <NumberControl label="Window" value={settings.rateWindowMs} min={200} max={5000} step={100} unit="ms" onChange={(rateWindowMs) => update({ rateWindowMs })} />
          <label className="lab-select">
            Over the limit{" "}
            <select value={settings.rateStrategy} onChange={(event) => update({ rateStrategy: event.target.value as LabSettings["rateStrategy"] })}>
              <option value="queue">queue the request</option>
              <option value="reject">refuse the request</option>
            </select>
          </label>
        </>
      );
    case "attempt":
      return <NumberControl label="End an attempt after" value={settings.attemptMs} min={100} max={5000} step={100} unit="ms" onChange={(attemptMs) => update({ attemptMs })} />;
  }
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]!;
}

function Timeline({ records, now }: { records: RequestRecord[]; now: number }): ReactElement {
  if (records.length === 0) return <p className="muted small">Send a request to see it here.</p>;
  const start = Math.min(...records.map((record) => record.start));
  const end = Math.max(now, ...records.map((record) => record.end ?? now));
  const span = Math.max(1000, end - start);
  const x = (time: number): string => `${((time - start) / span) * 100}%`;
  return (
    <div className="timeline" role="table" aria-label="The last requests">
      <div role="rowgroup">
        {records.map((record) => {
          const running = record.end === undefined;
          const tone = running ? "flight" : record.ok ? "good" : "bad";
          const duration = Math.round((record.end ?? now) - record.start);
          const result = running
            ? "running"
            : record.ok
              ? `ok${record.items > 1 ? `, ${record.items} items` : ""}`
              : (record.code ?? "error");
          const tries = record.attempts.length;
          const detail = record.answeredBy ? record.answeredBy : `${tries} ${tries === 1 ? "attempt" : "attempts"}`;
          return (
            <div key={record.request} className={`timeline-row tone-${tone}`} role="row">
              <span className="timeline-id" role="rowheader">
                #{record.request}
              </span>
              <span className="timeline-track" role="cell" aria-label={`${duration} ms`}>
                <span className="timeline-bar" style={{ left: x(record.start), width: `max(3px, calc(${x(record.end ?? now)} - ${x(record.start)}))` }} />
                {record.attempts.map((time, index) => (
                  <span key={index} className="timeline-tick" style={{ left: x(time) }} title={`Attempt ${index + 1}`} />
                ))}
              </span>
              <span className="timeline-text" role="cell">
                <span aria-hidden="true">{running ? "…" : record.ok ? "✓" : "✗"}</span> {result} · {duration} ms · {detail}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export function Lab(): ReactElement {
  const [settings, setSettings] = useState<LabSettings>(DEFAULT_SETTINGS);
  const [faults, setFaults] = useState<Faults>(DEFAULT_FAULTS);
  const [keyMode, setKeyMode] = useState<KeyMode>("three");
  const [auto, setAuto] = useState(false);
  const [rate, setRate] = useState(2);
  const [breaker, setBreaker] = useState<BreakerState>("CLOSED");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [, setVersion] = useState(0);
  const [now, setNow] = useState(() => performance.now());
  const [announcement, setAnnouncement] = useState("");

  const faultsRef = useRef(faults);
  faultsRef.current = faults;
  const listeners = useRef(new Set<(event: LabEvent) => void>());
  const records = useRef(new Map<number, RequestRecord>());
  const stats = useRef<Stats>(emptyStats(0));
  const log = useRef<string[]>([]);
  const keyCount = useRef(0);
  const flushing = useRef(0);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const lab = useRef<LabEngine | null>(null);
  /** The engine that loads now, for the settings of `settingsRef`. */
  const loading = useRef<Promise<LabEngine> | null>(null);
  const settingsRef = useRef(settings);

  const source: OnionHandle = useMemo(
    () => ({
      subscribe: (listener) => {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
    }),
    [],
  );

  /** React draws the counters at most once a frame. */
  const flush = useCallback(() => {
    if (flushing.current) return;
    flushing.current = requestAnimationFrame(() => {
      flushing.current = 0;
      setVersion((version) => version + 1);
      setNow(performance.now());
    });
  }, []);

  const layerShort = useCallback((index: number, layers: LayerId[]) => (index >= layers.length ? "server" : LAYER_INFO[layers[index]!].short), []);

  const onEvent = useCallback(
    (event: LabEvent, layers: LayerId[]) => {
      for (const listener of listeners.current) listener(event);
      const s = stats.current;
      const record = "request" in event ? records.current.get(event.request) : undefined;
      switch (event.kind) {
        case "send":
          s.sent++;
          records.current.set(event.request, { request: event.request, key: event.key, start: event.at, attempts: [], items: 0 });
          // Keep the last requests only
          if (records.current.size > 200) records.current.delete(records.current.keys().next().value!);
          break;
        case "enter":
          if (s.layers[event.layer]) s.layers[event.layer]!.in++;
          break;
        case "forward":
          if (s.layers[event.layer]) s.layers[event.layer]!.on++;
          break;
        case "server":
          s.serverCalls++;
          record?.attempts.push(event.at);
          break;
        case "item":
          if (s.layers[event.layer]) s.layers[event.layer]![event.ok ? "ok" : "failed"]++;
          break;
        case "thrown":
          if (s.layers[event.layer]) s.layers[event.layer]!.failed++;
          if (record && !record.answeredBy) record.answeredBy = `refused by the ${layerShort(event.layer, layers)}`;
          break;
        case "done": {
          if (event.ok) s.ok++;
          else s.failed++;
          if (!event.ok && event.code) s.codes[event.code] = (s.codes[event.code] ?? 0) + 1;
          if (record) {
            record.end = event.at;
            record.ok = event.ok;
            if (event.code !== undefined) record.code = event.code;
            record.items = event.items;
            if (record.attempts.length === 0 && event.ok && !record.answeredBy) record.answeredBy = "answered by the cache";
          }
          const line = `Request #${event.request}: ${event.ok ? "ok" : (event.code ?? "error")} after ${Math.round(event.at - (record?.start ?? event.at))} ms${
            record ? `, ${record.attempts.length} ${record.attempts.length === 1 ? "attempt" : "attempts"}` : ""
          }.`;
          log.current = [line, ...log.current].slice(0, 12);
          setAnnouncement(line);
          break;
        }
        case "breaker":
          setBreaker(event.state);
          log.current = [`The circuit breaker is ${event.state.replace("_", " ").toLowerCase()} now.`, ...log.current].slice(0, 12);
          break;
      }
      flush();
    },
    [flush, layerShort],
  );

  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  /**
   * The engine of the current settings. The first request loads it: the middlewares start again
   * with each change of the layers.
   */
  const engine = useCallback((): Promise<LabEngine> => {
    if (lab.current) return Promise.resolve(lab.current);
    if (loading.current) return loading.current;
    const wanted = settingsRef.current;
    const promise = import("../lib/lab").then(({ Lab: Engine }) => {
      if (loading.current !== promise) throw new Error("The settings changed while the engine loaded");
      const created: LabEngine = new Engine(wanted, () => faultsRef.current, (event) => onEventRef.current(event, created.layers));
      lab.current = created;
      loading.current = null;
      return created;
    });
    loading.current = promise;
    return promise;
  }, []);

  /** This function sends a request with a key, when the engine is ready. */
  const sendKey = useCallback(
    (key: string): void => {
      void engine()
        .then((ready) => ready.send(key))
        .catch(() => undefined);
    },
    [engine],
  );

  // A change of the layers ends the engine: the next request makes a new one
  useEffect(() => {
    settingsRef.current = settings;
    lab.current?.dispose();
    lab.current = null;
    loading.current = null;
    stats.current = { ...emptyStats(layersOf(settings).length), sent: 0 };
    records.current.clear();
    setBreaker("CLOSED");
    setVersion((version) => version + 1);
  }, [settings]);
  useEffect(() => () => lab.current?.dispose(), []);

  const nextKey = (): string => {
    keyCount.current++;
    if (keyMode === "one") return "key-1";
    if (keyMode === "three") return `key-${(keyCount.current % 3) + 1}`;
    return `key-${keyCount.current}`;
  };

  const send = (count = 1): void => {
    for (let index = 0; index < count; index++) sendKey(nextKey());
  };

  // Automatic traffic
  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => sendKey(nextKey()), 1000 / rate);
    return () => clearInterval(timer);
    // nextKey reads the refs and the key mode of this render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, rate, keyMode]);

  // The running requests move on the timeline
  useEffect(() => {
    const timer = setInterval(() => {
      if ((lab.current?.inFlight ?? 0) > 0) setNow(performance.now());
    }, 150);
    return () => clearInterval(timer);
  }, []);

  const clearTimers = (): void => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const runScenario = (chosen: Scenario): void => {
    clearTimers();
    setAuto(false);
    setScenario(chosen);
    setKeyMode(chosen.keyMode);
    keyCount.current = 0;
    log.current = [];
    const nextFaults = { ...DEFAULT_FAULTS, ...chosen.faults };
    setFaults(nextFaults);
    faultsRef.current = nextFaults;
    setSettings({ ...DEFAULT_SETTINGS, ...chosen.settings });
    // The new engine starts after the render: the traffic waits for it
    for (const delay of chosen.traffic) {
      timers.current.push(
        setTimeout(() => {
          keyCount.current++;
          const key = chosen.keyMode === "one" ? "key-1" : `key-${keyCount.current}`;
          sendKey(key);
        }, delay + 60),
      );
    }
    if (chosen.later) {
      const later = chosen.later;
      timers.current.push(
        setTimeout(() => {
          setFaults((previous) => {
            const next = { ...previous, ...later.faults };
            faultsRef.current = next;
            return next;
          });
          log.current = ["The server recovered: no more faults.", ...log.current].slice(0, 12);
          flush();
        }, later.at),
      );
    }
  };

  const reset = (): void => {
    clearTimers();
    setAuto(false);
    setScenario(null);
    log.current = [];
    setSettings({ ...settings });
  };

  const updateSettings = (change: Partial<LabSettings>): void => setSettings((previous) => ({ ...previous, ...change }));
  const updateFaults = (change: Partial<Faults>): void =>
    setFaults((previous) => {
      const next = { ...previous, ...change };
      faultsRef.current = next;
      return next;
    });

  const move = (id: LayerId, by: -1 | 1): void => {
    const order = [...settings.order];
    const index = order.indexOf(id);
    const target = index + by;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    updateSettings({ order });
  };

  const layers = layersOf(settings);
  const s = stats.current;
  const shown = [...records.current.values()].slice(-TIMELINE_ROWS).reverse();
  const durations = [...records.current.values()].filter((record) => record.end !== undefined).map((record) => record.end! - record.start);
  const p50 = percentile(durations, 0.5);
  const p95 = percentile(durations, 0.95);
  const onionLabel = `The layers from the outside in: ${layers.map((id) => LAYER_INFO[id].label).join(", ") || "none"}, then the server. ${s.sent} requests sent, ${s.ok} succeeded, ${s.failed} failed.`;

  return (
    <div className="lab-page">
      <h1>Middleware lab</h1>
      <p className="lead-text">
        The real middlewares of the client run here, in your browser, around a server that the page simulates. Change the
        layers and their order, inject faults into the server, and send requests. Each dot is a request, and each small dot is
        an item or an error on its way back.
      </p>

      <div className="scenarios" role="group" aria-label="Scenarios">
        {SCENARIOS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            className={scenario?.id === candidate.id ? "scenario active" : "scenario"}
            aria-pressed={scenario?.id === candidate.id}
            onClick={() => runScenario(candidate)}
          >
            {candidate.title}
          </button>
        ))}
      </div>
      {scenario ? <p className="hint scenario-text">{scenario.text}</p> : null}

      <div className="lab">
        <section className="panel lab-stage" aria-labelledby="stage-title">
          <div className="toolbar">
            <h2 id="stage-title" className="panel-title">
              The onion
            </h2>
            <span className="spacer" />
            <button type="button" className="primary" onClick={() => send(1)}>
              Send a request
            </button>
            <button type="button" onClick={() => send(10)}>
              Send 10 at once
            </button>
          </div>
          <div className="toolbar lab-traffic">
            <label className="small">
              <input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} /> Send automatically
            </label>
            <NumberControl label="Rate" value={rate} min={0.5} max={10} step={0.5} unit="per s" onChange={setRate} />
            <label className="lab-select small">
              Keys{" "}
              <select value={keyMode} onChange={(event) => setKeyMode(event.target.value as KeyMode)}>
                {Object.entries(KEY_MODES).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="ghost" onClick={() => lab.current?.abortAll()}>
              Stop the requests
            </button>
            <button type="button" className="ghost" onClick={reset}>
              Reset
            </button>
          </div>
          <div className="onion-wrap">
            <Onion layers={layers} breaker={breaker} source={source} label={onionLabel} />
          </div>
          <div className="lab-legend small" aria-hidden="true">
            <span className="legend-dot tone-flight" /> a request
            <span className="legend-dot small-dot tone-good" /> an item
            <span className="legend-dot small-dot tone-bad" /> an error
          </div>
          <p className="visually-hidden" aria-live="polite">
            {announcement}
          </p>
          <div className="lab-totals">
            <div>
              <strong>{s.sent}</strong> sent
            </div>
            <div className="tone-good">
              <strong>
                <span aria-hidden="true">✓ </span>
                {s.ok}
              </strong>{" "}
              succeeded
            </div>
            <div className="tone-bad">
              <strong>
                <span aria-hidden="true">✗ </span>
                {s.failed}
              </strong>{" "}
              failed
            </div>
            <div>
              <strong>{s.serverCalls}</strong> server calls
            </div>
            <div>
              <strong>{p50 === null ? "—" : `${Math.round(p50)} ms`}</strong> median
            </div>
            <div>
              <strong>{p95 === null ? "—" : `${Math.round(p95)} ms`}</strong> 95th percentile
            </div>
          </div>
          {Object.keys(s.codes).length > 0 ? (
            <p className="small muted">
              Errors:{" "}
              {Object.entries(s.codes)
                .map(([code, count]) => `${code} ${count}`)
                .join(", ")}
            </p>
          ) : null}
        </section>

        <aside className="lab-controls" aria-label="Settings">
          <section className="panel">
            <h2 className="panel-title">Layers</h2>
            <p className="small muted">From the outside in. The outside layer sees each request first and each answer last.</p>
            <ol className="layer-list">
              {settings.order.map((id, index) => (
                <li key={id} className={settings.enabled[id] ? "layer-item" : "layer-item off"}>
                  <div className="layer-head">
                    <label>
                      <input
                        type="checkbox"
                        checked={settings.enabled[id]}
                        onChange={(event) => updateSettings({ enabled: { ...settings.enabled, [id]: event.target.checked } })}
                      />{" "}
                      <strong>{LAYER_INFO[id].label}</strong>
                    </label>
                    <span className="spacer" />
                    <button type="button" className="icon" onClick={() => move(id, -1)} disabled={index === 0} aria-label={`Move ${LAYER_INFO[id].label} out`}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className="icon"
                      onClick={() => move(id, 1)}
                      disabled={index === settings.order.length - 1}
                      aria-label={`Move ${LAYER_INFO[id].label} in`}
                    >
                      ↓
                    </button>
                  </div>
                  <p className="small muted layer-summary">{LAYER_INFO[id].summary}</p>
                  {settings.enabled[id] ? <LayerSettings id={id} settings={settings} update={updateSettings} /> : null}
                </li>
              ))}
            </ol>
            <p className="small muted">A change of the layers starts them again: the cache is empty and the breaker is closed.</p>
          </section>

          <section className="panel">
            <h2 className="panel-title">The server</h2>
            <NumberControl label="Latency" value={faults.latencyMs} min={0} max={3000} step={50} unit="ms" onChange={(latencyMs) => updateFaults({ latencyMs })} />
            <NumberControl label="Jitter" value={faults.jitterMs} min={0} max={1000} step={25} unit="ms" onChange={(jitterMs) => updateFaults({ jitterMs })} />
            <NumberControl
              label="Errors"
              value={Math.round(faults.errorRate * 100)}
              min={0}
              max={100}
              step={5}
              unit="%"
              onChange={(percent) => updateFaults({ errorRate: percent / 100 })}
            />
            <label className="lab-check">
              <input type="checkbox" checked={faults.dead} onChange={(event) => updateFaults({ dead: event.target.checked })} /> A dead peer: the
              server takes each request and never answers
            </label>
            <NumberControl
              label="Items of an answer"
              value={faults.streamItems}
              min={1}
              max={12}
              onChange={(streamItems) => updateFaults({ streamItems })}
            />
            {faults.streamItems > 1 ? (
              <NumberControl label="Time between items" value={faults.streamGapMs} min={20} max={1500} step={20} unit="ms" onChange={(streamGapMs) => updateFaults({ streamGapMs })} />
            ) : null}
          </section>
        </aside>
      </div>

      <section className="status-section" aria-labelledby="layers-table">
        <h2 id="layers-table">Each layer</h2>
        <p className="muted small">
          “In” counts the requests that reached the layer. “On” counts how often it passed a request to the next layer: a retry
          passes one request on more than once, and a cache hit passes it on zero times.
        </p>
        <div className="table-wrap">
          <table className="schema lab-table">
            <thead>
              <tr>
                <th scope="col">Layer</th>
                <th scope="col">In</th>
                <th scope="col">On</th>
                <th scope="col">Items out</th>
                <th scope="col">Errors out</th>
              </tr>
            </thead>
            <tbody>
              {layers.map((id, index) => {
                const counts = s.layers[index] ?? { in: 0, on: 0, ok: 0, failed: 0 };
                return (
                  <tr key={id}>
                    <th scope="row">
                      {LAYER_INFO[id].label}
                      {id === "breaker" ? <span className="muted small"> ({breaker.replace("_", " ").toLowerCase()})</span> : null}
                    </th>
                    <td>{counts.in}</td>
                    <td>{counts.on}</td>
                    <td>{counts.ok}</td>
                    <td>{counts.failed}</td>
                  </tr>
                );
              })}
              <tr>
                <th scope="row">Server</th>
                <td>{s.serverCalls}</td>
                <td>—</td>
                <td colSpan={2} className="muted small">
                  the simulated server
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="status-section" aria-labelledby="timeline-title">
        <h2 id="timeline-title">Timeline</h2>
        <p className="muted small">The last {TIMELINE_ROWS} requests, the newest first. A tick is one attempt at the server.</p>
        <Timeline records={shown} now={now} />
      </section>

      <section className="status-section" aria-labelledby="log-title">
        <h2 id="log-title">What happened</h2>
        {log.current.length === 0 ? (
          <p className="muted small">Nothing yet.</p>
        ) : (
          <ol className="lab-log">
            {log.current.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
