import { useState, type ReactElement } from "react";
import { LiveHero } from "../components/LiveHero";
import { mcpTools, metrics, packages, procedures } from "../data";
import { href } from "../lib/router";

// The examples come from the data, so they stay true (deep dive SITE-13: the page said that MCP
// gives git.status, but git.* is not a tool)
const cliExample =
  procedures.find((procedure) => procedure.key === "git.status" && procedure.cli) ?? procedures.find((procedure) => procedure.cli);
const mcpExample = ["docker.ps", "cue.validate"].find((key) => mcpTools.includes(key)) ?? mcpTools[0] ?? "";

/** The install command: npm when the library is on the registry, else a clone of the repository. */
const install = metrics.npm.version
  ? { command: `npm install ${metrics.npm.name}`, note: `Version ${metrics.npm.version} on npm.` }
  : { command: "git clone https://github.com/mark1russell7/client", note: "The npm packages come soon. Until then, build the monorepo with pnpm." };

const HOSTS: Array<{ name: string; how: string; detail: string }> = [
  { name: "Your code", how: 'client.exec(["math", "add"], { a: 2, b: 3 })', detail: "The registry runs in your process. No server." },
  {
    name: "CLI",
    how: cliExample ? ["mark", ...cliExample.path].join(" ") : "mark",
    detail: "Each procedure is a command. Its schema gives the flags and the help.",
  },
  { name: "Claude Code", how: `${mcpExample} (MCP tool)`, detail: `The MCP server gives ${mcpTools.length} procedures to Claude as tools.` },
  { name: "HTTP", how: "POST /api/math/add", detail: "A server exposes the registry, with a token and browser checks." },
  { name: "WebSocket", how: '{ "type": "request" }', detail: "Calls in both directions, streams with flow control." },
  { name: "Browser", how: "this site", detail: "The Composer and this page run the real client in your browser." },
];

const DEFINE = `import { defineProcedure } from "@mark1russell7/client";
import { z } from "zod";

export const add = defineProcedure({
  path: ["math", "add"],
  input: z.object({ a: z.number(), b: z.number() }),
  output: z.number(),
  handler: ({ a, b }) => a + b,
});`;

const CALL = `await client.exec(["math", "add"], { a: 2, b: 3 }); // 5

$ mark math add --a 2 --b 3

$ curl -X POST http://127.0.0.1:3000/api/math/add \\
    -H "content-type: application/json" \\
    -H "authorization: Bearer $TOKEN" \\
    -d '{"a":2,"b":3}'`;

const COMPOSE = `{
  "$proc": ["math", "add"],
  "input": {
    "a": { "$proc": ["math", "add"], "input": { "a": 2, "b": 3 } },
    "b": 10
  }
}`;

function InstallCommand(): ReactElement {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(install.command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="install">
      <div className="install-box">
        <span className="install-prompt" aria-hidden="true">
          $
        </span>
        <code className="install-command">{install.command}</code>
        <button type="button" className="ghost small-button" onClick={() => void copy()} aria-label="Copy the install command">
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <p className="small muted install-note">{install.note}</p>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }): ReactElement {
  return (
    <div className="stat">
      <strong>{value.toLocaleString("en-US")}</strong>
      <span>{label}</span>
    </div>
  );
}

export function Home(): ReactElement {
  const lines = packages.reduce((total, pkg) => total + pkg.lines, 0);
  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <p className="hero-eyebrow">TypeScript · MIT · open source</p>
          <h1>
            Procedures as data. <span className="hero-accent">Call them from everywhere.</span>
          </h1>
          <p className="lead">
            Write a typed procedure once. Your code, the <code>mark</code> CLI, HTTP, WebSocket and the MCP tools of Claude Code
            call the same registry. A program is plain JSON, so you can store it, send it, draw it and compose it.
          </p>
          <InstallCommand />
          <div className="hero-actions">
            <a className="primary" href={href("composer")}>
              Open the Composer
            </a>
            <a className="secondary" href={href("catalog")}>
              Browse {procedures.length} procedures
            </a>
            <a className="text-link" href="https://github.com/mark1russell7/client">
              Source on GitHub →
            </a>
          </div>
        </div>
        <LiveHero />
      </section>

      <section className="stats" aria-label="The project in numbers">
        <Stat value={packages.length} label="packages" />
        <Stat value={procedures.length} label="procedures" />
        <Stat value={mcpTools.length} label="tools for Claude" />
        <Stat value={metrics.tests} label="tests" />
        <Stat value={lines} label="lines of TypeScript" />
      </section>
      <p className="small muted stats-note">
        Measured when this site was built: the procedures of the registry, the <code>it</code> and <code>test</code> calls in the
        test files, and the source lines without the tests.
      </p>

      <section aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <ol className="steps">
          <li className="step">
            <span className="step-number" aria-hidden="true">
              1
            </span>
            <div className="step-body">
              <h3>Define a procedure</h3>
              <p className="small">A path, an input schema, an output schema and a handler. Importing the package registers it.</p>
              <pre className="code" tabIndex={0} aria-label="Define a procedure">
                {DEFINE}
              </pre>
            </div>
          </li>
          <li className="step">
            <span className="step-number" aria-hidden="true">
              2
            </span>
            <div className="step-body">
              <h3>Call it from any host</h3>
              <p className="small">In process, from the CLI, over HTTP or WebSocket, or as a tool of Claude Code. One invocation path validates each call.</p>
              <pre className="code" tabIndex={0} aria-label="Call the procedure">
                {CALL}
              </pre>
            </div>
          </li>
          <li className="step">
            <span className="step-number" aria-hidden="true">
              3
            </span>
            <div className="step-body">
              <h3>Compose programs as JSON</h3>
              <p className="small">
                A call can be the input of another call. <code>chain</code>, <code>map</code>, <code>conditional</code> and{" "}
                <code>$ref</code> make programs that you can store and send.
              </p>
              <pre className="code" tabIndex={0} aria-label="A program as JSON">
                {COMPOSE}
              </pre>
            </div>
          </li>
        </ol>
      </section>

      <section aria-labelledby="hosts-title">
        <h2 id="hosts-title">Write it once, call it from everywhere</h2>
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
      </section>

      <section aria-labelledby="box-title">
        <h2 id="box-title">What is in the box</h2>
        <div className="cards">
          <div className="panel">
            <h3>Control flow as data</h3>
            <p className="small">
              <code>chain</code>, <code>parallel</code>, <code>conditional</code>, <code>tryCatch</code>, <code>map</code> and{" "}
              <code>reduce</code>. A branch that is not selected does not run.
            </p>
          </div>
          <div className="panel">
            <h3>Tools as procedures</h3>
            <p className="small">git, docker, pnpm, vitest, cue, the file system, MongoDB, SQLite and S3, each a package of typed procedures.</p>
          </div>
          <div className="panel">
            <h3>Middleware and streams</h3>
            <p className="small">Retry, timeout, cache, circuit breaker and rate limit around each call. Streams with flow control on each transport.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="explore-title">
        <h2 id="explore-title">Explore</h2>
        <div className="cards">
          <a className="panel explore-card" href={href("lab")}>
            <h3>The middleware lab →</h3>
            <p className="small">
              The real middlewares run around a server that you break: latency, errors, a dead peer, a slow stream. Watch each request go
              through the layers.
            </p>
          </a>
          <a className="panel explore-card" href={href("composer", undefined, { example: "chain" })}>
            <h3>The Composer →</h3>
            <p className="small">
              Build a program with blocks, JSON or TypeScript, or start from the gallery. The Graph tab draws it as a tree of calls, and the
              trace shows each call.
            </p>
          </a>
          <a className="panel explore-card" href={href("architecture")}>
            <h3>The journey of one call →</h3>
            <p className="small">
              Follow one streaming call through the middlewares, the transport, the server and the interceptors, over HTTP, WebSocket or
              MCP. Each step comes from the real code.
            </p>
          </a>
          <a className="panel explore-card" href={href("status")}>
            <h3>The status board →</h3>
            <p className="small">Each finding of the October deep dive and each bug of the July audit, with its status and its commits.</p>
          </a>
        </div>
      </section>
    </>
  );
}
