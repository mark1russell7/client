import { useEffect, useState, type ReactElement } from "react";
import { mcpTools, packages, procedures } from "../data";
import { examples } from "../lib/examples";
import { formatValue } from "../lib/display";
import { formatJson } from "../lib/program";
import { href } from "../lib/router";
import { runProgram, type RunResult } from "../lib/runtime";

// The examples come from the data, so they stay true (deep dive SITE-13: the page said that MCP
// gives git.status, but git.* is not a tool)
const cliExample =
  procedures.find((procedure) => procedure.key === "git.status" && procedure.cli) ?? procedures.find((procedure) => procedure.cli);
const mcpExample = ["docker.ps", "cue.validate"].find((key) => mcpTools.includes(key)) ?? mcpTools[0] ?? "";

const HOSTS: Array<{ name: string; how: string; detail: string }> = [
  { name: "In process", how: "client.exec(ref)", detail: "A program calls the registry directly." },
  {
    name: "CLI",
    how: cliExample ? ["mark", ...cliExample.path].join(" ") : "mark",
    detail: "Each procedure is a command. Its schema gives the flags.",
  },
  { name: "MCP", how: `${mcpExample} (tool)`, detail: `Claude Code gets ${mcpTools.length} procedures as tools.` },
  { name: "HTTP", how: "POST /api/git/status", detail: "A server exposes the registry over HTTP." },
  { name: "WebSocket", how: "{ type: \"request\" }", detail: "Calls in both directions on one connection." },
  { name: "Browser", how: "this site", detail: "The Composer runs the real client in your browser." },
];

function LiveExample(): ReactElement {
  const example = examples.find((candidate) => candidate.id === "chain") ?? examples[0]!;
  const [result, setResult] = useState<RunResult | null>(null);
  useEffect(() => {
    void runProgram(example.program).then(setResult);
  }, [example]);
  return (
    <div className="two-col">
      <div>
        <div className="muted small">A program is JSON</div>
        <pre className="code" tabIndex={0} aria-label="The program as JSON">
          {formatJson(example.program)}
        </pre>
      </div>
      <div>
        <div className="muted small">The client runs it (here, in your browser)</div>
        <pre className="code" tabIndex={0} aria-label="The result">
          {result ? (result.ok ? formatValue(result.value) : result.error) : "running…"}
        </pre>
        <p className="small" style={{ marginTop: "var(--space-3)" }}>
          {result ? `${result.calls.length} calls in ${result.duration.toFixed(2)} ms. ` : ""}
          <a href={href("composer", undefined, { example: example.id })}>Open it in the Composer →</a>
        </p>
      </div>
    </div>
  );
}

export function Home(): ReactElement {
  const cli = procedures.filter((procedure) => procedure.cli).length;
  return (
    <>
      <section className="hero">
        <h1>Procedures as data.</h1>
        <p className="lead">
          One registry of typed procedures. The CLI, the MCP server, HTTP, WebSocket and your own code call the same
          procedures. A program is plain JSON, so you can store it, send it and compose it.
        </p>
        <div className="hero-actions">
          <a className="primary" href={href("composer")}>
            Open the Composer
          </a>
          <a className="secondary" href={href("catalog")}>
            Browse the procedures
          </a>
          <a className="secondary" href={href("architecture")}>
            See the architecture
          </a>
        </div>
      </section>

      <div className="stats">
        <div className="stat">
          <strong>{packages.length}</strong>
          <span className="muted">packages</span>
        </div>
        <div className="stat">
          <strong>{cli}</strong>
          <span className="muted">CLI commands</span>
        </div>
        <div className="stat">
          <strong>{procedures.filter((procedure) => procedure.browser).length}</strong>
          <span className="muted">run in the browser</span>
        </div>
        <div className="stat">
          <strong>{mcpTools.length}</strong>
          <span className="muted">tools for Claude</span>
        </div>
      </div>

      <h2>Write it once, call it from everywhere</h2>
      <p>
        A package defines a procedure with a path, an input schema, an output schema and a handler. It registers
        the procedure when you import it. Each host reads the same registry.
      </p>
      <div className="hosts">
        {HOSTS.map((host) => (
          <div className="host" key={host.name}>
            <strong>{host.name}</strong>
            <div>
              <code>{host.how}</code>
            </div>
            <div className="small muted">{host.detail}</div>
          </div>
        ))}
      </div>

      <h2>Compose with JSON</h2>
      <p>
        An object with <code>$proc</code> is a call. A call can be the input of another call. A{" "}
        <code>chain</code> names its steps, and a later step reads an earlier result with <code>$ref</code>.
      </p>
      <LiveExample />

      <h2>What is in the box</h2>
      <div className="cards">
        <div className="panel">
          <h3>Control flow</h3>
          <p className="small">
            <code>chain</code>, <code>parallel</code>, <code>conditional</code>, <code>tryCatch</code>,{" "}
            <code>map</code> and <code>reduce</code>. A branch that is not selected does not run.
          </p>
        </div>
        <div className="panel">
          <h3>Tools</h3>
          <p className="small">
            git, docker, pnpm, vitest, cue, the file system, MongoDB, SQLite and S3, each as a package of procedures.
          </p>
        </div>
        <div className="panel">
          <h3>Middleware</h3>
          <p className="small">
            Retry, timeout, cache, circuit breaker, rate limit, authentication and tracing around each call.
          </p>
        </div>
      </div>
    </>
  );
}
