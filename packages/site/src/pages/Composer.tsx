import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { PICKER_LIST, Slot, browserProcedures, callFor, type EditorContext } from "../components/Blocks";
import { Palette } from "../components/Palette";
import { Trace } from "../components/Trace";
import { packages, procedureByKey } from "../data";
import { analyzeProgram } from "../lib/analysis";
import { formatValue, specialValues } from "../lib/display";
import { insertChoices, shortName, wrapInChain, type InsertChoice } from "../lib/edits";
import { examples, firstExample, type Example } from "../lib/examples";
import {
  canSetAt,
  countCalls,
  encodeProgram,
  formatJson,
  getAt,
  locationKey,
  parseLocation,
  parseProgram,
  readProgram,
  setAt,
  toTypeScript,
  type Json,
  type Location,
} from "../lib/program";
import { href, isOwnEntry, writeHash, type Route } from "../lib/router";
import { ProgramRunner } from "../lib/runner";
import { runProgram, type RunResult } from "../lib/runtime";

type Tab = "blocks" | "json" | "ts";

// ---------------------------------------------------------------------------
// History: undo, redo and the browser history
// ---------------------------------------------------------------------------

/** The undo steps that the Composer keeps. */
const HISTORY_LIMIT = 200;
/** Edits of one control within this time make one undo step and one browser history entry. */
const GROUP_MS = 1200;

interface History {
  past: Json[];
  present: Json;
  future: Json[];
  group: string | null;
  at: number;
  /** How the next render writes the URL: a new history entry, a change of the entry, or nothing. */
  write: "push" | "replace" | null;
  /** The example that the program is, for a short URL. */
  example: string | null;
}

type Action =
  | { type: "edit"; update: (program: Json) => Json; group?: string | undefined }
  | { type: "load"; program: Json; example: string | null; write: "push" | null }
  | { type: "undo" }
  | { type: "redo" };

function reduce(state: History, action: Action): History {
  const now = Date.now();
  switch (action.type) {
    case "edit": {
      const program = action.update(state.present);
      if (program === state.present) return state;
      const merge = action.group !== undefined && action.group === state.group && now - state.at < GROUP_MS;
      return {
        past: merge ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: program,
        future: [],
        group: action.group ?? null,
        at: now,
        write: merge ? "replace" : "push",
        example: null,
      };
    }
    case "load":
      return {
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: action.program,
        future: [],
        group: null,
        at: now,
        write: action.write,
        example: action.example,
      };
    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (previous === undefined) return state;
      return { ...state, past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future], group: null, write: "replace", example: null };
    }
    case "redo": {
      const next = state.future[0];
      if (next === undefined) return state;
      return { ...state, past: [...state.past, state.present], present: next, future: state.future.slice(1), group: null, write: "replace", example: null };
    }
  }
}

type FromRoute =
  | { kind: "link"; program: Json }
  | { kind: "example"; example: Example }
  | { kind: "invalid"; reason: string; example: Example };

/** The program that a route gives: a share link, an example, or the first example. */
function fromRoute(route: Route): FromRoute {
  const shared = route.query.get("p");
  if (shared !== null) {
    const read = readProgram(shared);
    return read.ok ? { kind: "link", program: read.program } : { kind: "invalid", reason: read.reason, example: firstExample };
  }
  const example = examples.find((candidate) => candidate.id === route.query.get("example")) ?? firstExample;
  return { kind: "example", example };
}

function hashOf(program: Json, example: string | null): string {
  return example ? href("composer", undefined, { example }) : href("composer", undefined, { p: encodeProgram(program) });
}

// ---------------------------------------------------------------------------
// Parts of the page
// ---------------------------------------------------------------------------

function JsonEditor({ program, onChange }: { program: Json; onChange: (program: Json) => void }): ReactElement {
  const [text, setText] = useState(() => formatJson(program));
  const [error, setError] = useState<string | null>(null);
  const last = useRef<Json>(program);
  useEffect(() => {
    if (program !== last.current) {
      last.current = program;
      setText(formatJson(program));
      setError(null);
    }
  }, [program]);
  return (
    <>
      <textarea
        className="code"
        spellCheck={false}
        aria-label="The program as JSON"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "json-error" : undefined}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = parseProgram(event.target.value);
          if (parsed.ok) {
            last.current = parsed.program;
            setError(null);
            onChange(parsed.program);
          } else {
            setError(parsed.reason);
          }
        }}
      />
      {error ? (
        <p className="error-text small" id="json-error" role="status">
          {error}
        </p>
      ) : null}
    </>
  );
}

function CopyButton({ text, label }: { text: () => string; label: string }): ReactElement {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      onClick={() => {
        const value = text();
        const done = (next: "copied" | "failed"): void => {
          setState(next);
          setTimeout(() => setState("idle"), 1800);
        };
        if (navigator.clipboard) navigator.clipboard.writeText(value).then(() => done("copied"), () => done("failed"));
        else done("failed");
      }}
    >
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}</span>
    </button>
  );
}

const TABS: Array<[Tab, string]> = [
  ["blocks", "Blocks"],
  ["json", "JSON"],
  ["ts", "TypeScript"],
];

/** The tabs of the program: arrow keys move between them (the WAI-ARIA tabs pattern). */
function TabList({ tab, setTab, calls }: { tab: Tab; setTab: (tab: Tab) => void; calls: number }): ReactElement {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const next =
      event.key === "ArrowRight" ? (index + 1) % TABS.length : event.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    const [id] = TABS[next]!;
    setTab(id);
    document.getElementById(`tab-${id}`)?.focus();
  };
  return (
    <div className="tabs">
      <div role="tablist" aria-label="Views of the program" className="tab-buttons">
        {TABS.map(([id, label], index) => (
          <button
            key={id}
            id={`tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {label}
          </button>
        ))}
      </div>
      <span className="spacer" />
      <span className="muted small">{calls} calls</span>
    </div>
  );
}

function ResultPanel({
  result,
  running,
  progress,
  live,
  armed,
  onRun,
  onStop,
}: {
  result: RunResult | null;
  running: boolean;
  progress: number;
  live: boolean;
  armed: boolean;
  onRun: () => void;
  onStop: () => void;
}): ReactElement {
  const special = result?.ok ? specialValues(result.value) : new Set<string>();
  const callCount = result ? result.calls.length + result.dropped : 0;
  return (
    <section className="panel result-panel" aria-labelledby="result-title">
      <div className="toolbar">
        <h2 id="result-title" className="panel-title">
          Result
        </h2>
        <span className="spacer" />
        {live && armed ? (
          <span className="pill good" title="The program runs after each change">
            live
          </span>
        ) : null}
        {running ? (
          <button type="button" className="danger" onClick={onStop}>
            ■ Stop
          </button>
        ) : null}
        <button type="button" className="primary" onClick={onRun} title="Run (Ctrl+Enter)">
          ▶ Run
        </button>
      </div>
      {!armed ? (
        <p className="callout" role="note">
          This program comes from a link. Read it first, then press Run. After the first run, Live runs it after each change.
        </p>
      ) : null}
      <div aria-live="polite" className="run-status">
        {running ? (
          <p className="muted small">
            Running… {progress > 0 ? `${progress.toLocaleString("en")} calls` : ""}
          </p>
        ) : null}
      </div>
      {result === null ? (
        !running && armed ? <p className="muted small">Run the program to see the result.</p> : null
      ) : (
        <>
          <div className="status-line" role="status">
            {result.ok ? (
              <span className="status-ok">✓ ok</span>
            ) : result.stopped ? (
              <span className="status-error">■ stopped</span>
            ) : (
              <span className="status-error">✗ error</span>
            )}
            <span className="muted">
              {callCount.toLocaleString("en")} {callCount === 1 ? "call" : "calls"} · {result.duration.toFixed(2)} ms
            </span>
          </div>
          {special.size > 0 ? (
            <p className="hint" role="note">
              ⚠ The result has {[...special].join(", ")}. A $ref with a wrong name gives undefined, and arithmetic on undefined gives
              NaN.
            </p>
          ) : null}
          {result.ok ? (
            <pre className="code result-value" tabIndex={0} aria-label="The result value">
              {formatValue(result.value)}
            </pre>
          ) : (
            <pre className="code result-value error-text" tabIndex={0} aria-label="The error">
              {result.error}
            </pre>
          )}
          <h3 className="trace-title">Trace</h3>
          <p className="muted small">Each call, nested under its caller. Select a call for its input and output.</p>
          <Trace result={result} />
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The Composer
// ---------------------------------------------------------------------------

function packageOf(key: string): string | undefined {
  const owner = procedureByKey(key)?.package;
  return owner ? packages.find((pkg) => pkg.dir === owner)?.name : undefined;
}

function fieldsOf(key: string) {
  return procedureByKey(key)?.fields ?? null;
}

function known(key: string): boolean {
  return procedureByKey(key) !== undefined;
}

/** A short text for a location: "steps 2 › a". */
function describeLocation(location: Location): string {
  const parts = location.filter((step) => step !== "input").map(String);
  return parts.length === 0 ? "the root" : parts.join(" › ");
}

export function Composer({ route }: { route: Route }): ReactElement {
  const [initial] = useState(() => fromRoute(route));
  const [state, dispatch] = useReducer(reduce, undefined, (): History => {
    const program = initial.kind === "link" ? initial.program : initial.example.program;
    return { past: [], present: program, future: [], group: null, at: 0, write: null, example: initial.kind === "example" ? initial.example.id : null };
  });
  const program = state.present;
  const present = useRef(program);
  present.current = program;

  const [tab, setTab] = useState<Tab>("blocks");
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [live, setLive] = useState(true);
  // A program from a link of another person does not run before the reader presses Run.
  // An entry that the Composer wrote (a reload, the Back button) runs (deep dive SITE-6).
  const [armed, setArmed] = useState(initial.kind !== "link" || isOwnEntry());
  const [notice, setNotice] = useState<string | null>(initial.kind === "invalid" ? `The link does not hold a valid program. ${initial.reason} The Composer shows an example.` : null);
  const [choices, setChoices] = useState<{ location: Location; name: string; list: InsertChoice[] } | null>(null);
  const lastHash = useRef(window.location.hash);
  const pendingFocus = useRef<string | null>(null);
  const runner = useRef<ProgramRunner | null>(null);
  const runCount = useRef(0);
  const lastRun = useRef<Json | undefined>(undefined);
  const choicesRef = useRef<HTMLDivElement>(null);

  const analysis = useMemo(() => analyzeProgram(program, known), [program]);

  // The route changed: the Back button, a pasted link, a link of the page (deep dive SITE-5)
  useEffect(() => {
    if (window.location.hash === lastHash.current) return;
    lastHash.current = window.location.hash;
    const next = fromRoute(route);
    setSelected(null);
    setChoices(null);
    if (next.kind === "invalid") {
      setNotice(`The link does not hold a valid program. ${next.reason}`);
      return;
    }
    setNotice(null);
    if (next.kind === "link") {
      dispatch({ type: "load", program: next.program, example: null, write: null });
      if (!isOwnEntry()) {
        setArmed(false);
        setResult(null);
      }
    } else {
      dispatch({ type: "load", program: next.example.program, example: next.example.id, write: null });
      setArmed(true);
    }
  }, [route]);

  // The URL follows the program: a new entry for an edit, so the Back button undoes it
  useEffect(() => {
    if (!state.write) return;
    writeHash(hashOf(state.present, state.example), state.write);
    lastHash.current = window.location.hash;
  }, [state]);

  // A selection that is not in the program any more goes away (deep dive SITE-3)
  useEffect(() => {
    if (selected === null) return;
    const location = parseLocation(selected);
    if (!location || getAt(program, location) === undefined) setSelected(null);
  }, [program, selected]);

  // The focus that an edit asked for: after a removal, it goes to the next slot (deep dive SITE-7)
  useEffect(() => {
    const key = pendingFocus.current;
    if (key === null) return;
    pendingFocus.current = null;
    const slot = document.querySelector(`[data-loc="${CSS.escape(key)}"]`);
    const target = slot?.querySelector<HTMLElement>("input, select, textarea, button, [tabindex]:not([tabindex='-1'])");
    (target ?? (slot as HTMLElement | null))?.focus();
  });

  useEffect(() => {
    if (choices) choicesRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [choices]);

  useEffect(() => {
    runner.current = typeof Worker === "undefined" ? null : new ProgramRunner(setProgress);
    return () => runner.current?.dispose();
  }, []);

  const run = useCallback(
    async (toRun: Json) => {
      const id = ++runCount.current;
      lastRun.current = toRun;
      setArmed(true);
      const problem = toRun === null ? null : analyzeProgram(toRun).rootProblem;
      if (toRun === null || problem) {
        setResult(problem ? { ok: false, error: problem, calls: [], dropped: 0, duration: 0 } : null);
        return;
      }
      setRunning(true);
      setProgress(0);
      const next = runner.current ? await runner.current.run(toRun) : await runProgram(toRun);
      if (id === runCount.current) {
        setResult(next);
        setRunning(false);
      }
    },
    [],
  );

  const stop = useCallback(() => runner.current?.stop(), []);

  useEffect(() => {
    if (!live || !armed || program === lastRun.current) return;
    const timer = setTimeout(() => void run(program), 250);
    return () => clearTimeout(timer);
  }, [program, live, armed, run]);

  const edit = useCallback((update: (program: Json) => Json, group?: string) => {
    dispatch({ type: "edit", update, group });
    setNotice(null);
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: "undo" });
    setSelected(null);
    setChoices(null);
  }, []);
  const redo = useCallback(() => {
    dispatch({ type: "redo" });
    setSelected(null);
    setChoices(null);
  }, []);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey;
      if (event.key === "Enter" && mod) {
        event.preventDefault();
        void run(present.current);
        return;
      }
      // The JSON text area keeps its own undo
      if (event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      if (mod && key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (mod && ((key === "z" && event.shiftKey) || key === "y")) {
        event.preventDefault();
        redo();
      } else if (event.key === "Escape") {
        setChoices(null);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, undo, redo]);

  const focus = useCallback((location: Location) => {
    pendingFocus.current = locationKey(location);
  }, []);

  const apply = useCallback(
    (choice: InsertChoice) => {
      edit(() => choice.program);
      setSelected(locationKey(choice.select));
      focus(choice.select);
      setChoices(null);
    },
    [edit, focus],
  );

  const insert = useCallback(
    (location: Location, key: string) => {
      const call = callFor(key);
      if (!call) return;
      const current = present.current;
      if (!canSetAt(current, location)) {
        setSelected(null);
        setNotice("The selected slot is not in the program any more. Select a slot again.");
        return;
      }
      const list = insertChoices(current, location, call, fieldsOf);
      if (list.length === 1) apply(list[0]!);
      else setChoices({ location, name: shortName(call), list });
    },
    [apply],
  );

  const ctx: EditorContext = useMemo(
    () => ({
      selected,
      select: (location: Location) => setSelected(locationKey(location)),
      set: (location: Location, value: Json | undefined, group?: string) => {
        if (!canSetAt(present.current, location)) return;
        edit((current) => (canSetAt(current, location) ? setAt(current, location, value) : current), group);
      },
      insert,
      wrap: (location: Location) => {
        edit((current) => wrapInChain(current, location));
        focus(location);
      },
      focus,
      analysis,
    }),
    [selected, edit, insert, focus, analysis],
  );

  const onPalette = (key: string): void => {
    if (selected !== null) {
      const location = parseLocation(selected);
      if (location) insert(location, key);
    } else if (program === null) {
      insert([], key);
    } else {
      setNotice("Select a slot of the program first: click it, or move the focus into it. Or drag the procedure onto a slot.");
    }
  };

  const loadExample = (id: string): void => {
    const chosen = examples.find((candidate) => candidate.id === id);
    if (!chosen) return;
    dispatch({ type: "load", program: chosen.program, example: chosen.id, write: "push" });
    setSelected(null);
    setChoices(null);
    setNotice(null);
    setArmed(true);
  };

  const example = examples.find((candidate) => candidate.id === state.example);
  const shareLink = (): string => `${window.location.origin}${window.location.pathname}${href("composer", undefined, { p: encodeProgram(present.current) })}`;
  const problems = [
    ...(analysis.rootProblem ? [{ key: "root", text: analysis.rootProblem, location: [] as Location }] : []),
    ...analysis.unknownCalls.map((use) => ({ key: `call:${locationKey(use.location)}`, text: `The procedure ${use.key} is not in the catalog.`, location: use.location })),
    ...analysis.unknownRefs.map((use) => ({
      key: `ref:${locationKey(use.location)}`,
      text: use.name === "" ? `A $ref at ${describeLocation(use.location)} has no name.` : `The $ref "${use.name}" at ${describeLocation(use.location)} is not in scope.`,
      location: use.location,
    })),
  ];
  const target = selected !== null ? "in the selected slot" : program === null ? "at the root" : "nowhere yet: select a slot first";

  return (
    <div className="composer">
      <datalist id={PICKER_LIST}>
        {browserProcedures.map((procedure) => (
          <option key={procedure.key} value={procedure.path[procedure.path.length - 1]}>
            {procedure.description}
          </option>
        ))}
      </datalist>

      <Palette onInsert={onPalette} target={target} />

      <section className="panel program-panel" aria-labelledby="program-title" onClick={() => setSelected(null)}>
        <h2 id="program-title" className="visually-hidden">
          Program
        </h2>
        <div className="toolbar" onClick={(event) => event.stopPropagation()}>
          <label className="small">
            Example{" "}
            <select value={state.example ?? ""} onChange={(event) => loadExample(event.target.value)}>
              {state.example === null ? <option value="">(your program)</option> : null}
              {examples.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.title}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => edit(() => null)} title="Start with an empty program">
            New
          </button>
          <span className="toolbar-group" role="group" aria-label="History">
            <button type="button" onClick={undo} disabled={state.past.length === 0} title="Undo (Ctrl+Z)">
              ↶ Undo
            </button>
            <button type="button" onClick={redo} disabled={state.future.length === 0} title="Redo (Ctrl+Shift+Z)">
              ↷ Redo
            </button>
          </span>
          <span className="spacer" />
          <label className="small">
            <input type="checkbox" checked={live} onChange={(event) => setLive(event.target.checked)} /> Live
          </label>
          <CopyButton text={shareLink} label="Copy link" />
        </div>
        {example ? <p className="example-summary">{example.summary}</p> : null}
        {notice ? (
          <p className="hint" role="status">
            {notice}
          </p>
        ) : null}
        {choices ? (
          <div
            className="insert-choices"
            role="group"
            aria-label={`Where does ${choices.name} go?`}
            ref={choicesRef}
            onClick={(event) => event.stopPropagation()}
          >
            <span className="small">Where does {choices.name} go?</span>
            {choices.list.map((choice) => (
              <button key={choice.id} type="button" className={choice.destructive ? "danger" : ""} onClick={() => apply(choice)}>
                {choice.label}
              </button>
            ))}
            <button type="button" className="ghost" onClick={() => setChoices(null)}>
              Cancel
            </button>
          </div>
        ) : null}
        {problems.length > 0 ? (
          <ul className="problems" aria-label="Problems of the program">
            {problems.slice(0, 6).map((problem) => (
              <li key={problem.key}>
                <button
                  type="button"
                  className="link-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setTab("blocks");
                    setSelected(locationKey(problem.location));
                    focus(problem.location);
                  }}
                >
                  ⚠ {problem.text}
                </button>
              </li>
            ))}
            {problems.length > 6 ? <li className="muted small">{problems.length - 6} more problems</li> : null}
          </ul>
        ) : null}

        <TabList tab={tab} setTab={setTab} calls={countCalls(program)} />

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="tab-panel">
          {tab === "blocks" ? (
            program === null ? (
              <div className="empty-program">
                <p>The program is empty. Drag a procedure here, click one in the list, or type a name.</p>
                <Slot value={program} location={[]} ctx={ctx} type={undefined} label="the program" />
              </div>
            ) : (
              <Slot value={program} location={[]} ctx={ctx} type={undefined} label="the program" />
            )
          ) : null}
          {tab === "json" ? <JsonEditor program={program} onChange={(next) => edit(() => next, "json")} /> : null}
          {tab === "ts" ? (
            <>
              <div className="toolbar">
                <span className="muted small">The same program with the proc() builder. It runs with Node and the packages.</span>
                <span className="spacer" />
                <CopyButton text={() => toTypeScript(program, packageOf)} label="Copy code" />
              </div>
              <pre className="code" tabIndex={0} aria-label="The program as TypeScript">
                {toTypeScript(program, packageOf)}
              </pre>
            </>
          ) : null}
        </div>
      </section>

      <ResultPanel result={result} running={running} progress={progress} live={live} armed={armed} onRun={() => void run(program)} onStop={stop} />
    </div>
  );
}
