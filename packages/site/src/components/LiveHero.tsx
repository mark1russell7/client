/**
 * The live panel of the home page. It runs a real program with the real client (in a Web Worker,
 * as the Composer does), then replays the calls of the trace as they happened: each call starts,
 * runs, and gives its result. The rows have a fixed place from the start, so the page does not move.
 *
 * With reduced motion (and in the prerender of the build), the panel shows the end state at once.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { previewValue } from "../lib/display";
import { heroProgram } from "../lib/examples";
import { compactJson } from "../lib/json-text";
import { encodeProgram, type Json } from "../lib/program";
import { href } from "../lib/router";
import { ProgramRunner } from "../lib/runner";
import type { RunResult, TraceCall } from "../lib/runtime";

const HERO_PROGRAM: Json = heroProgram;

/** The time of one step of the replay, in milliseconds. */
const STEP_MS = 170;

interface Row {
  call: TraceCall;
  depth: number;
}

/** The calls in the order of the tree: a hydrated call goes under the call that gets its result. */
function rowsOf(calls: readonly TraceCall[]): Row[] {
  const children = new Map<number | null, TraceCall[]>();
  for (const traced of calls) {
    const owner = traced.consumer ?? traced.parent;
    children.set(owner, [...(children.get(owner) ?? []), traced]);
  }
  const rows: Row[] = [];
  const visit = (owner: number | null, depth: number): void => {
    for (const child of [...(children.get(owner) ?? [])].sort((a, b) => a.start - b.start || a.id - b.id)) {
      rows.push({ call: child, depth });
      visit(child.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

interface ReplayEvent {
  id: number;
  kind: "start" | "end";
}

/**
 * The events of the run in time order: each call starts, then ends. At the same time, the starts
 * come first in the order of the calls, then the ends, the inner calls first. The order is total,
 * and a call never ends before it starts.
 */
export function replayEvents(calls: readonly TraceCall[]): ReplayEvent[] {
  const events: Array<ReplayEvent & { time: number; rank: number }> = [];
  const last = calls.reduce((max, traced) => Math.max(max, traced.id), 0) + 1;
  for (const traced of calls) {
    events.push({ id: traced.id, kind: "start", time: traced.start, rank: traced.id });
    events.push({ id: traced.id, kind: "end", time: Math.max(traced.end ?? traced.start, traced.start), rank: 2 * last - traced.id });
  }
  return events.sort((a, b) => a.time - b.time || a.rank - b.rank).map(({ id, kind }) => ({ id, kind }));
}

/** The input of a call in one short line: "start 1, end 6", "a $ref item". */
function inputLine(input: unknown): string {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return previewValue(input);
  return Object.entries(input as Record<string, unknown>)
    .filter(([key]) => !key.startsWith("__"))
    .map(([key, value]) => `${key} ${previewValue(value)}`)
    .join(", ");
}

/** The result of the chain: its `final` value, as text. */
function finalText(value: unknown): string {
  const final = value !== null && typeof value === "object" && "final" in value ? (value as { final: unknown }).final : value;
  return typeof final === "string" ? final : previewValue(final);
}

function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The JSON of the program, with the keys of the format in the accent color. */
function ProgramCode({ program }: { program: Json }): ReactElement {
  const text = compactJson(program);
  const parts = text.split(/("\$(?:proc|ref|name)")/g);
  return (
    <pre className="hero-code" tabIndex={0} aria-label="The program as JSON">
      {parts.map((part, index) => (part.startsWith('"$') ? <span key={index} className="tok-key">{part}</span> : part))}
    </pre>
  );
}

export function LiveHero(): ReactElement {
  const [result, setResult] = useState<RunResult | null>(null);
  const [step, setStep] = useState(0);
  const runner = useRef<ProgramRunner | null>(null);

  const rows = useMemo(() => (result ? rowsOf(result.calls) : []), [result]);
  const events = useMemo(() => (result ? replayEvents(result.calls) : []), [result]);

  const run = useCallback(async () => {
    runner.current ??= new ProgramRunner();
    setStep(0);
    const next = await runner.current.run(HERO_PROGRAM);
    setResult(next);
    setStep(reducedMotion() ? Number.MAX_SAFE_INTEGER : 0);
  }, []);

  useEffect(() => {
    void run();
    return () => runner.current?.dispose();
  }, [run]);

  // The replay: one event for each step
  useEffect(() => {
    if (!result || step >= events.length) return;
    const timer = window.setTimeout(() => setStep((current) => current + 1), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [result, step, events.length]);

  const shown = events.slice(0, step);
  const started = new Set(shown.filter((event) => event.kind === "start").map((event) => event.id));
  const ended = new Set(shown.filter((event) => event.kind === "end").map((event) => event.id));
  const done = result !== null && step >= events.length;
  const total = result ? result.calls.length + result.dropped : 0;

  return (
    <section className="live-hero" aria-labelledby="live-hero-title" data-loading={result ? undefined : ""}>
      <div className="live-hero-bar">
        <span className={done ? "live-dot" : "live-dot running"} aria-hidden="true" />
        <h2 id="live-hero-title" className="live-hero-title">
          A live program, run by the real client in your browser
        </h2>
        <button type="button" className="ghost small-button" onClick={() => void run()} disabled={!done} aria-label="Run the program again">
          ↻ Run again
        </button>
      </div>
      <ProgramCode program={HERO_PROGRAM} />
      <ol className="hero-trace" aria-label="The calls of the run">
        {(result ? rows : placeholderRows()).map((row) => {
          const state = ended.has(row.call.id) ? "done" : started.has(row.call.id) ? "active" : "pending";
          const output = row.call.error ? `✗ ${row.call.error}` : previewValue(row.call.output);
          return (
            <li key={row.call.id} className={`hero-call ${state}`} style={{ paddingLeft: `calc(${row.depth} * 1.1rem + var(--space-2))` }}>
              <span className="hero-call-key">{row.call.key}</span>
              <span className="hero-call-input">{result ? inputLine(row.call.input) : ""}</span>
              <span className="hero-call-output" aria-hidden={state !== "done"}>
                {state === "done" ? `→ ${output}` : state === "active" ? "running" : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="live-hero-foot" aria-live="polite">
        {result ? (
          <span>
            {done ? (
              <>
                <span className={result.ok ? "status-ok" : "status-error"}>{result.ok ? "✓" : "✗"}</span> {total} calls in{" "}
                {result.duration.toFixed(1)} ms · <strong>{result.ok ? finalText(result.value) : result.error}</strong>
              </>
            ) : (
              `${ended.size} of ${total} calls`
            )}
          </span>
        ) : (
          <span>Starting the client…</span>
        )}
        <a href={href("composer", undefined, { p: encodeProgram(HERO_PROGRAM) })}>Open it in the Composer →</a>
      </div>
    </section>
  );
}

/** Rows of the right count and depth before the first run, so the panel has its height at once. */
function placeholderRows(): Row[] {
  const depths = [0, 1, 1, 2, 2, 2, 2, 2, 1, 1];
  return depths.map((depth, index) => ({ call: { id: -1 - index, parent: null, key: "", input: null, start: 0 }, depth }));
}
