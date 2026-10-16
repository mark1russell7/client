/**
 * The onion of the middleware lab: one ring for each layer (the first layer outside), and the
 * server in the middle.
 *
 * - A request is a dot. It moves in, ring by ring, to the server. A layer that answers itself
 *   (a cache hit, an open circuit breaker, a refused rate limit) keeps the dot at its ring. A
 *   retry moves the dot back to its ring, then in again.
 * - An item or an error is a small particle. It moves out from where it starts until the layer
 *   that keeps it (a retry keeps a retryable error), or out of the onion to the caller.
 * - At the end of the call, the dot leaves the onion in the color of the result.
 *
 * The animation runs outside React: the events come through `subscribe`, and each frame moves
 * the SVG elements. With "reduced motion", the dots jump to each place.
 */

import { useEffect, useRef, type ReactElement } from "react";
import { LAYER_INFO, type BreakerState, type LabEvent, type LayerId } from "../lib/lab-info";

const R_OUT = 190;
const R_CORE = 44;
const OUTSIDE = R_OUT + 14;
const GOLDEN = (137.508 * Math.PI) / 180;
const SPEED = 0.75; // px per ms
const SVG_NS = "http://www.w3.org/2000/svg";

type Tone = "flight" | "good" | "bad";

interface Mover {
  element: SVGCircleElement;
  angle: number;
  r: number;
  from: number;
  to: number;
  start: number;
  duration: number;
  /** The next places of the dot, with a color for each. */
  queue: Array<{ r: number; tone?: Tone; end?: boolean }>;
  tone: Tone;
  /** The mover moves to its last place: when it arrives, it fades out. */
  ending?: boolean;
  /** The time to remove the element, when it fades out. */
  removeAt?: number;
}

interface Particle extends Mover {
  /** The lowest layer that passed the item on. */
  lowest: number;
}

export interface OnionHandle {
  subscribe: (listener: (event: LabEvent) => void) => () => void;
}

function ringRadii(count: number): Array<{ outer: number; inner: number; mid: number }> {
  const band = count === 0 ? 0 : (R_OUT - R_CORE) / count;
  return Array.from({ length: count }, (_, index) => {
    const outer = R_OUT - index * band;
    return { outer, inner: outer - band, mid: outer - band / 2 };
  });
}

/** The path of a ring with a hole (the even-odd rule cuts the inner circle). */
function annulus(outer: number, inner: number): string {
  const circle = (r: number): string => `M ${-r} 0 a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
  return `${circle(outer)} ${circle(inner)}`;
}

export function Onion({
  layers,
  breaker,
  source,
  label,
}: {
  layers: LayerId[];
  breaker: BreakerState;
  source: OnionHandle;
  label: string;
}): ReactElement {
  const dotsLayer = useRef<SVGGElement>(null);
  const ringRefs = useRef<Array<SVGPathElement | null>>([]);
  const coreRef = useRef<SVGCircleElement>(null);
  const rings = ringRadii(layers.length);

  useEffect(() => {
    const group = dotsLayer.current;
    if (!group) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const dots = new Map<number, Mover>();
    const particles = new Map<number, Particle>();
    /** Particles that a newer item of their request replaced: they finish their move. */
    const free = new Set<Mover>();
    const fading: Mover[] = [];
    let frame = 0;
    const radii = ringRadii(layers.length);
    const midOf = (layer: number): number => (layer >= layers.length ? 0 : radii[layer]!.mid);
    const edgeOf = (layer: number): number => (layer >= layers.length ? R_CORE : radii[layer]!.outer);

    const flash = (element: Element | null | undefined, tone: "good" | "bad"): void => {
      if (!element || reduce) return;
      element.classList.remove("flash-good", "flash-bad");
      // Restart the CSS animation
      void (element as SVGElement).getBoundingClientRect();
      element.classList.add(`flash-${tone}`);
    };

    const makeCircle = (r: number, className: string): SVGCircleElement => {
      const element = document.createElementNS(SVG_NS, "circle");
      element.setAttribute("r", String(r));
      element.setAttribute("class", className);
      group.appendChild(element);
      return element;
    };

    const place = (mover: Mover): void => {
      mover.element.setAttribute("cx", (Math.cos(mover.angle) * mover.r).toFixed(2));
      mover.element.setAttribute("cy", (Math.sin(mover.angle) * mover.r).toFixed(2));
    };

    const setTone = (mover: Mover, tone: Tone): void => {
      mover.tone = tone;
      mover.element.classList.remove("tone-flight", "tone-good", "tone-bad");
      mover.element.classList.add(`tone-${tone}`);
    };

    /** The mover starts its next move, if it has one. */
    const advance = (mover: Mover, now: number): void => {
      while (mover.queue.length > 0) {
        const next = mover.queue.shift()!;
        if (next.tone) setTone(mover, next.tone);
        if (next.end) mover.ending = true;
        if (Math.abs(next.r - mover.r) < 0.5) continue;
        mover.from = mover.r;
        mover.to = next.r;
        mover.start = now;
        mover.duration = reduce ? 0 : Math.max(90, Math.abs(next.r - mover.r) / SPEED);
        return;
      }
    };

    const moving = (mover: Mover): boolean => mover.r !== mover.to || mover.queue.length > 0;

    /** One frame of a mover. It gives true when the mover is done and leaves its collection. */
    const step = (mover: Mover, now: number): boolean => {
      if (mover.r === mover.to) advance(mover, now);
      if (mover.r !== mover.to) {
        const t = mover.duration === 0 ? 1 : Math.min(1, (now - mover.start) / mover.duration);
        const eased = 1 - (1 - t) * (1 - t);
        mover.r = t >= 1 ? mover.to : mover.from + (mover.to - mover.from) * eased;
        place(mover);
      }
      if (mover.ending && !moving(mover)) {
        mover.element.classList.add("leaving");
        mover.removeAt = now + 500;
        fading.push(mover);
        return true;
      }
      return false;
    };

    const tick = (now: number): void => {
      frame = 0;
      let busy = false;
      for (const collection of [dots, particles] as Array<Map<number, Mover>>) {
        for (const [key, mover] of collection) {
          if (step(mover, now)) collection.delete(key);
          else if (moving(mover)) busy = true;
        }
      }
      for (const mover of free) {
        if (step(mover, now)) free.delete(mover);
        else busy = true;
      }
      for (let index = fading.length - 1; index >= 0; index--) {
        const mover = fading[index]!;
        if (now >= (mover.removeAt ?? now)) {
          mover.element.remove();
          fading.splice(index, 1);
        } else {
          busy = true;
        }
      }
      // A dot that waits (at the server, in a queue) needs no frame: the next event wakes the loop
      if (busy) frame = requestAnimationFrame(tick);
    };

    const wake = (): void => {
      if (frame === 0) frame = requestAnimationFrame(tick);
    };

    /** The dot of a request: it starts outside the onion. */
    const dotOf = (request: number): Mover => {
      let dot = dots.get(request);
      if (!dot) {
        const angle = (request * GOLDEN) % (2 * Math.PI);
        dot = { element: makeCircle(6, "lab-dot tone-flight"), angle, r: OUTSIDE, from: OUTSIDE, to: OUTSIDE, start: 0, duration: 0, queue: [], tone: "flight" };
        place(dot);
        dots.set(request, dot);
        // Old dots go first: the onion shows at most 60 requests
        if (dots.size > 60) {
          const [oldest] = dots.keys();
          dots.get(oldest!)?.element.remove();
          dots.delete(oldest!);
        }
      }
      return dot;
    };

    /** An item or an error that moves out from `layer`. */
    const itemAt = (request: number, layer: number, ok: boolean): void => {
      const open = particles.get(request);
      if (open && layer < open.lowest) {
        // The same item: it passed one more layer on
        open.lowest = layer;
        open.ending = false;
        open.queue.length = 0;
        open.queue.push({ r: layer === 0 ? OUTSIDE : edgeOf(layer), end: true });
        return;
      }
      if (open) free.add(open);
      const angle = ((request * GOLDEN) % (2 * Math.PI)) + 0.06;
      const start = midOf(layer);
      const particle: Particle = {
        element: makeCircle(3.5, `lab-particle tone-${ok ? "good" : "bad"}`),
        angle,
        r: start,
        from: start,
        to: start,
        start: 0,
        duration: 0,
        queue: [{ r: layer === 0 ? OUTSIDE : edgeOf(layer), end: true }],
        tone: ok ? "good" : "bad",
        lowest: layer,
      };
      place(particle);
      particles.set(request, particle);
    };

    const onEvent = (event: LabEvent): void => {
      switch (event.kind) {
        case "send":
          dotOf(event.request);
          break;
        case "enter":
          dotOf(event.request).queue.push({ r: midOf(event.layer) });
          break;
        case "forward":
          // A layer that passes the request on again (a retry): the dot comes back to the layer first
          if (event.count > 1) dotOf(event.request).queue.push({ r: midOf(event.layer) });
          break;
        case "server":
          dotOf(event.request).queue.push({ r: 0 });
          flash(coreRef.current, "good");
          break;
        case "item":
          itemAt(event.request, event.layer, event.ok);
          if (!event.ok) flash(event.layer >= layers.length ? coreRef.current : ringRefs.current[event.layer], "bad");
          break;
        case "thrown":
          itemAt(event.request, event.layer, false);
          flash(ringRefs.current[event.layer], "bad");
          break;
        case "done": {
          const dot = dotOf(event.request);
          dot.queue.push({ r: OUTSIDE, tone: event.ok ? "good" : "bad", end: true });
          break;
        }
        case "breaker":
          break;
      }
      wake();
    };

    const unsubscribe = source.subscribe(onEvent);
    return () => {
      unsubscribe();
      if (frame) cancelAnimationFrame(frame);
      group.replaceChildren();
    };
  }, [layers, source]);

  return (
    <svg className="onion" viewBox={`${-OUTSIDE - 8} ${-OUTSIDE - 8} ${2 * OUTSIDE + 16} ${2 * OUTSIDE + 16}`} role="img" aria-label={label}>
      {rings.map((ring, index) => {
        const id = layers[index]!;
        const text = id === "breaker" ? `${LAYER_INFO[id].short} · ${breaker.replace("_", " ").toLowerCase()}` : LAYER_INFO[id].short;
        return (
          <g key={id} className={`onion-ring ring-${index % 2 === 0 ? "even" : "odd"}${id === "breaker" ? ` breaker-${breaker.toLowerCase()}` : ""}`}>
            <path
              ref={(element) => {
                ringRefs.current[index] = element;
              }}
              d={annulus(ring.outer, ring.inner)}
              fillRule="evenodd"
            />
            <text x={0} y={-ring.mid} dominantBaseline="middle" textAnchor="middle" className="onion-label">
              {text}
            </text>
          </g>
        );
      })}
      <circle ref={coreRef} className="onion-core" r={R_CORE - 3} />
      <text x={0} y={0} dominantBaseline="middle" textAnchor="middle" className="onion-label core-label">
        server
      </text>
      <g ref={dotsLayer} className="onion-dots" />
    </svg>
  );
}
