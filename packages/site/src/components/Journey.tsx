/**
 * The journey of one call (the Architecture page): the steps that the real client, middlewares,
 * transports, server and interceptors record for one streaming call (`lib/journey.ts`), drawn as
 * lanes from the app at the top to the nested calls at the bottom. A token moves from step to
 * step. The scrubber, the buttons and the list of steps move it too.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { HOSTS, LANE_INFO, type Host, type Journey as JourneyData, type JourneyStep, type Lane } from "../lib/journey-info";
import { JourneyClient } from "../lib/journey-client";
import { useMediaQuery } from "../lib/media";

const SPEEDS = [
  { label: "0.5×", ms: 1300 },
  { label: "1×", ms: 700 },
  { label: "2×", ms: 330 },
] as const;

/** The side of a lane, for its color: the client, the wire, the server, the procedure. */
function sideOf(lane: Lane): "client" | "wire" | "server" | "procedure" {
  if (lane === "app" || lane === "retry" || lane === "timeout" || lane === "transport") return "client";
  if (lane === "wire") return "wire";
  if (lane === "server" || lane === "interceptor" || lane === "validation") return "server";
  return "procedure";
}

const ARROW: Record<JourneyStep["direction"], string> = { down: "↓", up: "↑", here: "•" };

/** The width of an element, after each resize. */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

interface DiagramProps {
  journey: JourneyData;
  index: number;
  width: number;
  compact: boolean;
  onPick: (index: number) => void;
}

function Diagram({ journey, index, width, compact, onPick }: DiagramProps): ReactElement {
  const labelWidth = compact ? 86 : 112;
  const rowHeight = compact ? 26 : 32;
  const top = 6;
  const right = 14;
  const height = top * 2 + journey.lanes.length * rowHeight;
  const steps = journey.steps;
  const x0 = labelWidth + 14;
  const x1 = Math.max(x0 + 40, width - right);
  const xOf = (i: number): number => (steps.length <= 1 ? x0 : x0 + (i * (x1 - x0)) / (steps.length - 1));
  const laneIndex = useMemo(() => new Map(journey.lanes.map((lane, i) => [lane, i])), [journey.lanes]);
  const yOf = (lane: Lane): number => top + (laneIndex.get(lane) ?? 0) * rowHeight + rowHeight / 2;
  const current = steps[index];

  const pick = (event: React.PointerEvent<SVGSVGElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * width;
    const ratio = (x - x0) / Math.max(1, x1 - x0);
    onPick(Math.max(0, Math.min(steps.length - 1, Math.round(ratio * (steps.length - 1)))));
  };

  return (
    <svg
      className="journey-diagram"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`The ${steps.length} steps of the call in ${journey.lanes.length} lanes. The list of steps under the diagram gives the same steps as text.`}
      onPointerDown={pick}
    >
      {journey.lanes.map((lane, i) => (
        <g key={lane} className={`journey-lane side-${sideOf(lane)}${current?.lane === lane ? " active" : ""}`}>
          <rect className="journey-band" x={0} y={top + i * rowHeight} width={width} height={rowHeight} />
          <text className="journey-lane-label" x={8} y={top + i * rowHeight + rowHeight / 2}>
            {LANE_INFO[lane].label}
          </text>
        </g>
      ))}
      {steps.map((step, i) => {
        if (i === 0) return null;
        const previous = steps[i - 1]!;
        const done = i <= index;
        const item = step.item ?? previous.item;
        return (
          <line
            key={`l${i}`}
            className={`journey-segment${done ? " done" : ""}${step.direction === "up" && item ? ` item item-${((item - 1) % 6) + 1}` : ""}`}
            x1={xOf(i - 1)}
            y1={yOf(previous.lane)}
            x2={xOf(i)}
            y2={yOf(step.lane)}
          />
        );
      })}
      {steps.map((step, i) => (
        <circle
          key={`d${i}`}
          className={`journey-dot${i <= index ? " done" : ""}${step.item ? ` item item-${((step.item - 1) % 6) + 1}` : ""}`}
          cx={xOf(i)}
          cy={yOf(step.lane)}
          r={compact ? 2.2 : 2.8}
        />
      ))}
      {current ? (
        <g className="journey-token" style={{ transform: `translate(${xOf(index)}px, ${yOf(current.lane)}px)` }}>
          <circle r={compact ? 8 : 10} className="journey-token-halo" />
          <circle r={compact ? 4.5 : 5.5} className={`journey-token-core${current.item ? ` item item-${((current.item - 1) % 6) + 1}` : ""}`} />
        </g>
      ) : null}
    </svg>
  );
}

export function Journey(): ReactElement {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const compact = useMediaQuery("(max-width: 720px)");
  const [host, setHost] = useState<Host>("http");
  const [journey, setJourney] = useState<JourneyData | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [stageRef, width] = useWidth();
  const sectionRef = useRef<HTMLElement | null>(null);
  const client = useRef<JourneyClient | null>(null);
  const started = useRef(false);

  // The journey of the host, from the worker. With reduced motion, the journey shows its whole
  // path at once (the last step), and nothing moves until the reader moves it.
  const reduceRef = useRef(reduceMotion);
  reduceRef.current = reduceMotion;
  useEffect(() => {
    let cancelled = false;
    const runner = (client.current ??= new JourneyClient());
    void runner.run(host).then((next) => {
      if (cancelled) return;
      setJourney(next);
      setIndex(reduceRef.current ? next.steps.length - 1 : 0);
    });
    return () => {
      cancelled = true;
    };
  }, [host]);
  useEffect(() => () => client.current?.dispose(), []);

  // The first time the journey comes into view, it plays (not with reduced motion)
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || reduceMotion || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !started.current) {
        started.current = true;
        setPlaying(true);
      }
    }, { threshold: 0.4 });
    observer.observe(section);
    return () => observer.disconnect();
  }, [reduceMotion]);

  // Playback
  const steps = journey?.steps ?? [];
  useEffect(() => {
    if (!playing || steps.length === 0) return;
    if (index >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setIndex((value) => Math.min(value + 1, steps.length - 1)), SPEEDS[speed]!.ms);
    return () => clearTimeout(timer);
  }, [playing, index, steps.length, speed]);

  const step = steps[index];
  const go = (next: number): void => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(steps.length - 1, next)));
  };
  const togglePlay = (): void => {
    if (index >= steps.length - 1) setIndex(0);
    setPlaying((value) => !value);
  };
  const received = steps.slice(0, index + 1).filter((candidate) => candidate.lane === "app" && candidate.item !== undefined);
  const hostInfo = HOSTS.find((candidate) => candidate.id === host)!;

  return (
    <section className="journey" ref={sectionRef} aria-labelledby="journey-title">
      <div className="journey-head">
        <div>
          <h2 id="journey-title">The journey of one call</h2>
          <p>
            One streaming call, <code>shop.receipt</code>, through the real client, middlewares, transport, server and
            interceptors. The page runs them in a worker and records each step when it happens. The handler makes two nested
            calls, then yields three items, and each item goes back up through every layer.
          </p>
        </div>
        <div className="journey-hosts" role="radiogroup" aria-label="Host">
          {HOSTS.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="radio"
              aria-checked={host === candidate.id}
              className={host === candidate.id ? "selected" : undefined}
              onClick={() => setHost(candidate.id)}
            >
              {candidate.label}
            </button>
          ))}
        </div>
        <p className="small muted journey-host-summary">{hostInfo.summary}</p>
      </div>

      <div className={`journey-stage graph-paper${reduceMotion ? " still" : ""}`} ref={stageRef}>
        {journey && journey.host === host ? (
          <Diagram journey={journey} index={index} width={width} compact={compact} onPick={go} />
        ) : (
          <p className="journey-loading small muted">The page runs the call…</p>
        )}
      </div>

      <div className="journey-controls" aria-label="Playback">
        <div className="journey-buttons">
          <button type="button" className="icon-button" onClick={() => go(0)} disabled={index === 0} aria-label="First step">
            ⏮
          </button>
          <button type="button" className="icon-button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous step">
            ◀
          </button>
          <button type="button" className="primary journey-play" onClick={togglePlay} disabled={steps.length === 0}>
            {playing ? "Pause" : index >= steps.length - 1 && steps.length > 0 ? "Play again" : "Play"}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => go(index + 1)}
            disabled={index >= steps.length - 1}
            aria-label="Next step"
          >
            ▶
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => go(steps.length - 1)}
            disabled={index >= steps.length - 1}
            aria-label="Last step"
          >
            ⏭
          </button>
        </div>
        <label className="journey-scrubber">
          <span className="visually-hidden">Step</span>
          <input
            type="range"
            min={0}
            max={Math.max(0, steps.length - 1)}
            value={index}
            onChange={(event) => go(Number(event.target.value))}
            aria-valuetext={step ? `Step ${index + 1} of ${steps.length}: ${step.title}` : undefined}
            disabled={steps.length === 0}
          />
        </label>
        <label className="journey-speed small">
          Speed{" "}
          <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            {SPEEDS.map((candidate, i) => (
              <option key={candidate.label} value={i}>
                {candidate.label}
              </option>
            ))}
          </select>
        </label>
        <span className="journey-counter small muted" aria-hidden="true">
          {steps.length > 0 ? `Step ${index + 1} of ${steps.length}` : ""}
          {step ? ` · ${step.at.toFixed(2)} ms` : ""}
        </span>
      </div>

      <div className="journey-panels">
        <div className={`panel journey-detail side-${step ? sideOf(step.lane) : "client"}`}>
          {step ? (
            <>
              <p className="journey-where small">
                <span className="journey-lane-chip">{LANE_INFO[step.lane].label}</span>{" "}
                <span aria-hidden="true">{ARROW[step.direction]}</span>
                <span className="visually-hidden">{step.direction === "down" ? "toward the handler" : step.direction === "up" ? "toward the app" : ""}</span>
                {step.item ? <span className={`journey-item-chip item-${((step.item - 1) % 6) + 1}`}>item {step.item}</span> : null}
              </p>
              <p className="journey-title" aria-live={playing ? "off" : "polite"}>
                {step.title}
              </p>
              {step.detail ? <pre className="code-block journey-code">{step.detail}</pre> : null}
              <p className="small muted">{LANE_INFO[step.lane].summary}</p>
            </>
          ) : (
            <p className="small muted">The page runs the call…</p>
          )}
        </div>
        <div className="panel journey-received" style={{ "--items": journey?.items.length ?? 3 } as CSSProperties}>
          <h3 className="small">The app has</h3>
          <ol>
            {(journey?.items ?? []).map((line, i) => {
              const got = received.some((candidate) => candidate.item === i + 1);
              return (
                <li key={line} className={got ? `got item-${(i % 6) + 1}` : "waiting"}>
                  {got ? line : "…"}
                </li>
              );
            })}
          </ol>
          {journey && !journey.ok ? <p className="small error-text">{journey.error}</p> : null}
        </div>
      </div>

      <details className="journey-list">
        <summary>The steps as text</summary>
        <ol>
          {steps.map((candidate, i) => (
            <li key={i}>
              <button
                type="button"
                className="link-button"
                aria-current={i === index ? "step" : undefined}
                onClick={() => go(i)}
              >
                <span className="journey-list-lane">{LANE_INFO[candidate.lane].label}</span> {candidate.title}
              </button>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
