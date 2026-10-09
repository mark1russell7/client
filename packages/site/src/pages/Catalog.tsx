import { useEffect, useMemo, useState, type ReactElement } from "react";
import { packages, procedureByKey, procedures, type JsonSchema, type ProcedureInfo } from "../data";
import { encodeProgram, newCall } from "../lib/program";
import { href, writeHash, type Route } from "../lib/router";

function typeText(schema: JsonSchema | undefined): string {
  if (!schema) return "";
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  if (schema.anyOf) return schema.anyOf.map(typeText).join(" | ");
  const type = Array.isArray(schema.type) ? schema.type.join(" | ") : (schema.type ?? "any");
  if (type === "array") return `${typeText(schema.items) || "any"}[]`;
  return type;
}

function Badges({ procedure }: { procedure: ProcedureInfo }): ReactElement {
  return (
    <span className="badges">
      {procedure.mcp ? <span className="pill accent" title="Claude Code gets it as a tool">MCP</span> : null}
      {procedure.cli ? <span className="pill" title="The mark CLI has it as a command">CLI</span> : null}
      {procedure.browser ? <span className="pill good" title="Runs in the Composer">browser</span> : null}
      {!procedure.registered ? <span className="pill warn" title="Defined, but not in the default registry">not registered</span> : null}
    </span>
  );
}

function SchemaTable({ schema, fields }: { schema: JsonSchema; fields: ProcedureInfo["fields"] }): ReactElement {
  if (fields && fields.length > 0) {
    return (
      <div className="table-wrap">
      <table className="schema">
        <thead>
          <tr>
            <th>Field</th>
            <th>Type</th>
            <th>Required</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.name}>
              <td>
                <code>{field.name}</code>
              </td>
              <td>
                <code>{field.type}</code>
              </td>
              <td>{field.optional ? "no" : "yes"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    );
  }
  const properties = Object.entries(schema.properties ?? {});
  if (properties.length === 0) {
    return <p className="muted small">The schema does not list fields ({typeText(schema)}).</p>;
  }
  const required = new Set(schema.required ?? []);
  return (
    <div className="table-wrap">
    <table className="schema">
      <thead>
        <tr>
          <th>Field</th>
          <th>Type</th>
          <th>Required</th>
          <th>Default</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {properties.map(([name, property]) => (
          <tr key={name}>
            <td>
              <code>{name}</code>
            </td>
            <td>
              <code>{typeText(property)}</code>
            </td>
            <td>{required.has(name) ? "yes" : "no"}</td>
            <td>{property.default !== undefined ? <code>{JSON.stringify(property.default)}</code> : ""}</td>
            <td className="small">{property.description ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

function cliCommand(procedure: ProcedureInfo): string {
  const required = new Set(procedure.input.required ?? []);
  const flags = Object.entries(procedure.input.properties ?? {})
    .filter(([name]) => required.has(name))
    .map(([name, property]) => `--${name} <${typeText(property)}>`);
  return ["mark", ...procedure.path, ...flags].join(" ");
}

function Detail({ procedure }: { procedure: ProcedureInfo }): ReactElement {
  const pkg = packages.find((candidate) => candidate.dir === procedure.package);
  return (
    <article className="panel">
      <p className="small">
        <a href={href("catalog")}>← All procedures</a>
      </p>
      <h1>
        <code>{procedure.key}</code>
      </h1>
      <p>{procedure.description || <span className="muted">No description.</span>}</p>
      <Badges procedure={procedure} />
      <dl className="facts">
        <dt>Package</dt>
        <dd>
          <a href={href("architecture", procedure.package)}>{pkg?.name ?? procedure.package}</a>
        </dd>
        <dt>Path</dt>
        <dd>
          <code>{JSON.stringify(procedure.path)}</code>
        </dd>
        <dt>CLI</dt>
        <dd>
          {procedure.cli ? (
            <code>{cliCommand(procedure)}</code>
          ) : (
            <span className="muted">
              Not a <code>mark</code> command: {procedure.registered ? "its package does not declare client.procedures" : "it is not in the default registry"}.
            </span>
          )}
        </dd>
        {procedure.mcp ? (
          <>
            <dt>MCP tool</dt>
            <dd>
              <code>{procedure.key}</code> on the <code>dev-tools</code> server
            </dd>
          </>
        ) : null}
        <dt>As data</dt>
        <dd>
          <code>{JSON.stringify({ $proc: procedure.path, input: {} })}</code>
        </dd>
        {procedure.tags.length > 0 ? (
          <>
            <dt>Tags</dt>
            <dd>{procedure.tags.join(", ")}</dd>
          </>
        ) : null}
      </dl>
      {procedure.browser ? (
        <p>
          <a href={href("composer", undefined, { p: encodeProgram(newCall(procedure.path, procedure.fields)) })}>
            Try it in the Composer →
          </a>
        </p>
      ) : null}
      <h2>Input</h2>
      <SchemaTable schema={procedure.input} fields={procedure.fields} />
      <h2>Output</h2>
      <SchemaTable schema={procedure.output} fields={null} />
      <details style={{ marginTop: "var(--space-4)" }}>
        <summary className="small">JSON Schemas</summary>
        <pre className="code" tabIndex={0} aria-label="The JSON Schemas">
          {JSON.stringify({ input: procedure.input, output: procedure.output }, null, 2)}
        </pre>
      </details>
    </article>
  );
}

interface Filters {
  query: string;
  pkg: string;
  onlyMcp: boolean;
  onlyCli: boolean;
  onlyBrowser: boolean;
  showUnregistered: boolean;
}

function filtersOf(route: Route): Filters {
  const q = route.query;
  return {
    query: q.get("q") ?? "",
    pkg: q.get("package") ?? "",
    onlyMcp: q.get("mcp") === "1",
    onlyCli: q.get("cli") === "1",
    onlyBrowser: q.get("browser") === "1",
    showUnregistered: q.get("unregistered") !== "0",
  };
}

/** The filters as a query, so a link keeps them (site improvement idea 8). */
function queryOf(filters: Filters): Record<string, string> {
  return {
    q: filters.query,
    package: filters.pkg,
    mcp: filters.onlyMcp ? "1" : "",
    cli: filters.onlyCli ? "1" : "",
    browser: filters.onlyBrowser ? "1" : "",
    unregistered: filters.showUnregistered ? "" : "0",
  };
}

export function Catalog({ route }: { route: Route }): ReactElement {
  const [filters, setFilters] = useState<Filters>(() => filtersOf(route));
  const { query, pkg, onlyMcp, onlyCli, onlyBrowser, showUnregistered } = filters;
  const update = (change: Partial<Filters>): void => setFilters((previous) => ({ ...previous, ...change }));

  // A link or the Back button changes the filters
  useEffect(() => {
    if (!route.rest) setFilters(filtersOf(route));
  }, [route]);

  // The filters change the URL without a new history entry
  useEffect(() => {
    if (route.rest) return;
    writeHash(href("catalog", undefined, queryOf(filters)), "replace");
  }, [filters, route.rest]);

  const groups = useMemo(() => {
    const text = query.trim().toLowerCase();
    const map = new Map<string, ProcedureInfo[]>();
    for (const procedure of procedures) {
      if (pkg && procedure.package !== pkg) continue;
      if (onlyMcp && !procedure.mcp) continue;
      if (onlyCli && !procedure.cli) continue;
      if (onlyBrowser && !procedure.browser) continue;
      if (!showUnregistered && !procedure.registered) continue;
      if (text && !procedure.key.toLowerCase().includes(text) && !procedure.description.toLowerCase().includes(text)) continue;
      const namespace = procedure.path[0] ?? "";
      const list = map.get(namespace);
      if (list) list.push(procedure);
      else map.set(namespace, [procedure]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [query, pkg, onlyMcp, onlyCli, onlyBrowser, showUnregistered]);

  const selected = route.rest ? procedureByKey(route.rest) : undefined;
  if (selected) return <Detail procedure={selected} />;

  const count = groups.reduce((sum, [, list]) => sum + list.length, 0);
  const owners = [...new Set(procedures.map((procedure) => procedure.package))].sort();

  return (
    <>
      <h1>Procedures</h1>
      <p>
        Every procedure of the workspace, generated from the registry at build time. The input and output schemas are
        the schemas that the CLI and the MCP server use.
      </p>
      <div className="catalog">
        <aside className="panel filters" aria-label="Filters">
          <input
            type="search"
            placeholder="Search"
            aria-label="Search the procedures"
            value={query}
            onChange={(event) => update({ query: event.target.value })}
          />
          <select value={pkg} onChange={(event) => update({ pkg: event.target.value })} aria-label="Package">
            <option value="">All packages</option>
            {owners.map((owner) => (
              <option key={owner} value={owner}>
                {owner}
              </option>
            ))}
          </select>
          <label>
            <input type="checkbox" checked={onlyMcp} onChange={(event) => update({ onlyMcp: event.target.checked })} /> Only MCP tools
          </label>
          <label>
            <input type="checkbox" checked={onlyCli} onChange={(event) => update({ onlyCli: event.target.checked })} /> Only CLI
            commands
          </label>
          <label>
            <input type="checkbox" checked={onlyBrowser} onChange={(event) => update({ onlyBrowser: event.target.checked })} /> Only
            browser procedures
          </label>
          <label>
            <input
              type="checkbox"
              checked={showUnregistered}
              onChange={(event) => update({ showUnregistered: event.target.checked })}
            />{" "}
            Show the procedures that are not registered
          </label>
          <p className="muted small" aria-live="polite">
            {count} procedures
          </p>
        </aside>
        <div className="proc-list">
          {groups.map(([namespace, list]) => (
            <section className="proc-group" key={namespace}>
              <h3>{namespace}.*</h3>
              {list.map((procedure) => (
                <a className="proc-row" key={procedure.key} href={href("catalog", procedure.key)}>
                  <code>{procedure.key}</code>
                  <span className="small muted">{procedure.description}</span>
                  <Badges procedure={procedure} />
                </a>
              ))}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
