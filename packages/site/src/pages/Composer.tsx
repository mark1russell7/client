import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { PICKER_LIST, Slot, browserProcedures, callFor, type EditorContext } from "../components/Blocks";
import { Palette } from "../components/Palette";
import { Trace } from "../components/Trace";
import { examples, firstExample } from "../lib/examples";
import { countCalls, decodeProgram, encodeProgram, formatJson, setAt, toTypeScript, type Json, type Location } from "../lib/program";
import { href, replaceHash, type Route } from "../lib/router";
import { runProgram, type RunResult } from "../lib/runtime";

type Tab = "blocks" | "json" | "ts";

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
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          try {
            const parsed = JSON.parse(event.target.value) as Json;
            last.current = parsed;
            setError(null);
            onChange(parsed);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
          }
        }}
      />
      {error ? <p className="error-text small">The JSON is not valid: {error}</p> : null}
    </>
  );
}

function CopyButton({ text, label }: { text: () => string; label: string }): ReactElement {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text()).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function ResultPanel({ result, live, onRun }: { result: RunResult | null; live: boolean; onRun: () => void }): ReactElement {
  return (
    <section className="panel result-panel" aria-label="Result">
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Result</h3>
        <span className="spacer" />
        {!live ? (
          <button type="button" className="primary" onClick={onRun} title="Run (Ctrl+Enter)">
            ▶ Run
          </button>
        ) : (
          <span className="pill good" title="The program runs after each change">
            live
          </span>
        )}
      </div>
      {result === null ? (
        <p className="muted small">Run the program to see the result.</p>
      ) : (
        <>
          <div className="status-line">
            {result.ok ? <span className="status-ok">✓ ok</span> : <span className="status-error">✗ error</span>}
            <span className="muted">
              {result.calls.length} {result.calls.length === 1 ? "call" : "calls"} · {result.duration.toFixed(2)} ms
            </span>
          </div>
          {result.ok ? (
            <pre className="code result-value">{formatJson(result.value)}</pre>
          ) : (
            <pre className="code result-value error-text">{result.error}</pre>
          )}
          <h3 style={{ marginTop: "var(--space-4)" }}>Trace</h3>
          <p className="muted small">Each call, nested under its caller. Click a call for its input and output.</p>
          <Trace result={result} />
        </>
      )}
    </section>
  );
}

export function Composer({ route }: { route: Route }): ReactElement {
  const initial = useMemo(() => {
    const shared = route.query.get("p");
    const decoded = shared ? decodeProgram(shared) : undefined;
    if (decoded !== undefined) return { program: decoded, example: null as string | null };
    const example = examples.find((candidate) => candidate.id === route.query.get("example")) ?? firstExample;
    return { program: example.program, example: example.id as string | null };
    // The route gives only the first program
  }, []);

  const [program, setProgram] = useState<Json>(initial.program);
  const [exampleId, setExampleId] = useState<string | null>(initial.example);
  const [tab, setTab] = useState<Tab>("blocks");
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [live, setLive] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const runCount = useRef(0);

  const run = useCallback(async (toRun: Json) => {
    const id = ++runCount.current;
    const next = await runProgram(toRun);
    if (id === runCount.current) setResult(next);
  }, []);

  useEffect(() => {
    if (!live) return;
    const timer = setTimeout(() => void run(program), 200);
    return () => clearTimeout(timer);
  }, [program, live, run]);

  // The share link follows the program
  useEffect(() => {
    const timer = setTimeout(() => replaceHash(href("composer", undefined, { p: encodeProgram(program) })), 400);
    return () => clearTimeout(timer);
  }, [program]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void run(program);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [program, run]);

  const change = useCallback((next: Json) => {
    setProgram(next);
    setExampleId(null);
    setNotice(null);
  }, []);

  const ctx: EditorContext = useMemo(
    () => ({
      selected,
      select: (location: Location) => setSelected(JSON.stringify(location)),
      set: (location: Location, value: Json | undefined) => {
        setProgram((current) => setAt(current, location, value));
        setExampleId(null);
        setNotice(null);
      },
    }),
    [selected],
  );

  const insert = (key: string): void => {
    const call = callFor(key);
    if (!call) return;
    if (program === null) {
      change(call);
      setSelected("[]");
    } else if (selected === null) {
      setNotice("Click a slot of the program first. Or drag the procedure onto a slot.");
    } else {
      ctx.set(JSON.parse(selected) as Location, call);
    }
  };

  const example = examples.find((candidate) => candidate.id === exampleId);

  return (
    <div className="composer">
      <datalist id={PICKER_LIST}>
        {browserProcedures.map((procedure) => (
          <option key={procedure.key} value={procedure.path[procedure.path.length - 1]}>
            {procedure.description}
          </option>
        ))}
      </datalist>

      <Palette onInsert={insert} />

      <section className="panel" aria-label="Program" onClick={() => setSelected(null)}>
        <div className="toolbar" onClick={(event) => event.stopPropagation()}>
          <label className="small">
            Example{" "}
            <select
              value={exampleId ?? ""}
              onChange={(event) => {
                const chosen = examples.find((candidate) => candidate.id === event.target.value);
                if (chosen) {
                  setProgram(chosen.program);
                  setExampleId(chosen.id);
                  setSelected(null);
                }
              }}
            >
              {exampleId === null ? <option value="">(your program)</option> : null}
              {examples.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.title}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => change(null)} title="Start with an empty program">
            New
          </button>
          <span className="spacer" />
          <label className="small">
            <input type="checkbox" checked={live} onChange={(event) => setLive(event.target.checked)} /> Live
          </label>
          <CopyButton text={() => window.location.href} label="Copy link" />
        </div>
        {example ? <p className="example-summary">{example.summary}</p> : null}
        {notice ? <p className="hint">{notice}</p> : null}

        <div className="tabs" role="tablist" onClick={(event) => event.stopPropagation()}>
          {(
            [
              ["blocks", "Blocks"],
              ["json", "JSON"],
              ["ts", "TypeScript"],
            ] as Array<[Tab, string]>
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
          <span className="spacer" style={{ flex: 1 }} />
          <span className="muted small" style={{ alignSelf: "center" }}>
            {countCalls(program)} calls
          </span>
        </div>

        {tab === "blocks" ? (
          program === null ? (
            <div className="empty-program">
              <p>The program is empty. Drag a procedure here, click one on the left, or type a name.</p>
              <Slot value={program} location={[]} ctx={ctx} type={undefined} />
            </div>
          ) : (
            <Slot value={program} location={[]} ctx={ctx} type={undefined} />
          )
        ) : null}
        {tab === "json" ? <JsonEditor program={program} onChange={change} /> : null}
        {tab === "ts" ? (
          <>
            <div className="toolbar">
              <span className="muted small">The same program with the proc() builder. Run it with Node and the package.</span>
              <span className="spacer" />
              <CopyButton text={() => toTypeScript(program)} label="Copy code" />
            </div>
            <pre className="code">{toTypeScript(program)}</pre>
          </>
        ) : null}
      </section>

      <ResultPanel result={result} live={live} onRun={() => void run(program)} />
    </div>
  );
}
