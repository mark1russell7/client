import { useMemo, useState, type ReactElement } from "react";
import { packages, type PackageInfo } from "../data";
import { href, type Route } from "../lib/router";

const NODE_WIDTH = 176;
const NODE_HEIGHT = 44;
const COLUMN = 214;
const ROW = 56;
const MARGIN = 36;

type Kind = "core" | "bundle" | "app" | "procedures" | "other";

const APPS = new Set(["mark", "impl-mcp-dev", "server", "site", "documentation", "cli"]);
const CORE = new Set(["client", "client-collections", "mcp"]);

function kindOf(pkg: PackageInfo): Kind {
  if (CORE.has(pkg.dir)) return "core";
  if (pkg.dir.startsWith("bundle-")) return "bundle";
  if (APPS.has(pkg.dir)) return "app";
  if (pkg.procedures > 0) return "procedures";
  return "other";
}

const KIND_LABEL: Record<Kind, string> = {
  core: "Core",
  procedures: "Procedure package",
  bundle: "Bundle",
  app: "App or tool",
  other: "Library",
};

interface Placed {
  pkg: PackageInfo;
  x: number;
  y: number;
}

/** A layered layout: one column for each level, and an order in a column from the positions of the dependencies. */
function layout(): { placed: Map<string, Placed>; width: number; height: number; levels: number } {
  const byLevel = new Map<number, PackageInfo[]>();
  for (const pkg of packages) byLevel.set(pkg.level, [...(byLevel.get(pkg.level) ?? []), pkg]);
  const levels = Math.max(...packages.map((pkg) => pkg.level)) + 1;
  const dependents = new Map<string, number>();
  for (const pkg of packages) for (const dep of pkg.deps) dependents.set(dep, (dependents.get(dep) ?? 0) + 1);

  const row = new Map<string, number>();
  const placed = new Map<string, Placed>();
  let tallest = 0;
  for (let level = 0; level < levels; level++) {
    const column = [...(byLevel.get(level) ?? [])];
    if (level === 0) {
      column.sort((a, b) => (dependents.get(b.dir) ?? 0) - (dependents.get(a.dir) ?? 0) || a.dir.localeCompare(b.dir));
    } else {
      const center = (pkg: PackageInfo): number => {
        const rows = pkg.deps.map((dep) => row.get(dep)).filter((value): value is number => value !== undefined);
        return rows.length === 0 ? 0 : rows.reduce((sum, value) => sum + value, 0) / rows.length;
      };
      column.sort((a, b) => center(a) - center(b) || a.dir.localeCompare(b.dir));
    }
    column.forEach((pkg, index) => {
      row.set(pkg.dir, index);
      placed.set(pkg.dir, { pkg, x: MARGIN + level * COLUMN, y: MARGIN + 18 + index * ROW });
    });
    tallest = Math.max(tallest, column.length);
  }
  return {
    placed,
    levels,
    width: MARGIN * 2 + (levels - 1) * COLUMN + NODE_WIDTH,
    height: MARGIN * 2 + 18 + tallest * ROW,
  };
}

function shortLines(lines: number): string {
  return lines >= 1000 ? `${(lines / 1000).toFixed(1)}k` : String(lines);
}

function edgePath(from: Placed, to: Placed): string {
  const x1 = from.x + NODE_WIDTH;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_HEIGHT / 2;
  const bend = Math.max(40, (x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function Details({ pkg }: { pkg: PackageInfo }): ReactElement {
  const usedBy = packages.filter((candidate) => candidate.deps.includes(pkg.dir));
  return (
    <aside className="panel">
      <h3>
        <code>{pkg.dir}</code>
      </h3>
      <p className="small">{pkg.description || <span className="muted">No description.</span>}</p>
      <dl className="facts">
        <dt>Name</dt>
        <dd>
          <code>{pkg.name}</code>
        </dd>
        <dt>Kind</dt>
        <dd>{KIND_LABEL[kindOf(pkg)]}</dd>
        <dt>Level</dt>
        <dd>{pkg.level}</dd>
        <dt>Source</dt>
        <dd>{pkg.lines.toLocaleString()} lines</dd>
        <dt>Procedures</dt>
        <dd>
          {pkg.procedures > 0 ? (
            <a href={href("catalog", undefined, { package: pkg.dir })}>{pkg.procedures}</a>
          ) : (
            "0"
          )}
        </dd>
      </dl>
      <h3 className="small">Uses ({pkg.deps.length})</h3>
      <p className="small">
        {pkg.deps.length === 0
          ? "No workspace package."
          : pkg.deps.map((dep, index) => (
              <span key={dep}>
                {index > 0 ? ", " : ""}
                <a href={href("architecture", dep)}>{dep}</a>
              </span>
            ))}
      </p>
      <h3 className="small">Used by ({usedBy.length})</h3>
      <p className="small">
        {usedBy.length === 0
          ? "No workspace package."
          : usedBy.map((user, index) => (
              <span key={user.dir}>
                {index > 0 ? ", " : ""}
                <a href={href("architecture", user.dir)}>{user.dir}</a>
              </span>
            ))}
      </p>
      <p className="small">
        <a href={`https://github.com/mark1russell7/client/tree/main/packages/${pkg.dir}`}>Source on GitHub →</a>
      </p>
    </aside>
  );
}

export function Architecture({ route }: { route: Route }): ReactElement {
  const { placed, width, height, levels } = useMemo(layout, []);
  const [hover, setHover] = useState<string | null>(null);
  const focus = hover ?? (route.rest || null);
  const focused = focus ? placed.get(focus) : undefined;

  const related = useMemo(() => {
    if (!focus) return null;
    const set = new Set<string>([focus]);
    for (const pkg of packages) {
      if (pkg.dir === focus) pkg.deps.forEach((dep) => set.add(dep));
      if (pkg.deps.includes(focus)) set.add(pkg.dir);
    }
    return set;
  }, [focus]);

  return (
    <>
      <h1>Architecture</h1>
      <p>
        The {packages.length} packages of the workspace and their dependencies, generated from each{" "}
        <code>package.json</code>. A column is a level: a package uses only packages to its left. Point at a package to
        see its dependencies. Click it for the details.
      </p>
      <div className="legend">
        <span style={{ ["--swatch" as string]: "var(--series-1)" }}>Core</span>
        <span style={{ ["--swatch" as string]: "var(--color-rule-strong)" }}>Procedure package or library</span>
        <span style={{ ["--swatch" as string]: "var(--series-7)" }}>Bundle</span>
        <span style={{ ["--swatch" as string]: "var(--series-3)" }}>App or tool</span>
        <span style={{ ["--swatch" as string]: "var(--color-accent)" }}>Uses</span>
        <span style={{ ["--swatch" as string]: "var(--series-2)" }}>Used by</span>
      </div>
      <div className="arch">
        <div className="arch-canvas">
          <svg width={width} height={height} role="img" aria-label="Dependency map of the packages">
            {Array.from({ length: levels }, (_, level) => (
              <text key={level} className="arch-level-label" x={MARGIN + level * COLUMN} y={MARGIN}>
                Level {level}
              </text>
            ))}
            {packages.flatMap((pkg) =>
              pkg.deps.map((dep) => {
                const from = placed.get(dep);
                const to = placed.get(pkg.dir);
                if (!from || !to) return null;
                let className = "arch-edge";
                if (focus) {
                  if (pkg.dir === focus) className += " out";
                  else if (dep === focus) className += " in";
                  else className += " dim";
                }
                return <path key={`${dep}->${pkg.dir}`} className={className} d={edgePath(from, to)} />;
              }),
            )}
            {[...placed.values()].map(({ pkg, x, y }) => {
              let className = `arch-node kind-${kindOf(pkg)}`;
              if (related && !related.has(pkg.dir)) className += " dim";
              if (focus === pkg.dir) className += " focus";
              return (
                <a key={pkg.dir} href={href("architecture", pkg.dir)} aria-label={pkg.dir}>
                  <g
                    className={className}
                    transform={`translate(${x} ${y})`}
                    onMouseEnter={() => setHover(pkg.dir)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx={6} />
                    <text x={10} y={18}>
                      {pkg.dir}
                    </text>
                    <text className="meta" x={10} y={34}>
                      {pkg.procedures > 0 ? `${pkg.procedures} proc · ` : ""}
                      {shortLines(pkg.lines)} lines
                    </text>
                  </g>
                </a>
              );
            })}
          </svg>
        </div>
        {focused ? (
          <Details pkg={focused.pkg} />
        ) : (
          <aside className="panel">
            <h3>Layers</h3>
            <p className="small">
              <strong>Core</strong>: <code>client</code> (the registry, the client, the transports, the servers) and{" "}
              <code>client-collections</code>.
            </p>
            <p className="small">
              <strong>Procedure packages</strong> wrap one tool each: git, docker, pnpm, vitest, cue, the file system,
              MongoDB, SQLite, S3. Most of them run commands through <code>client-shell</code>.
            </p>
            <p className="small">
              <strong>Bundles</strong> import a set of packages, so one import registers all their procedures.
            </p>
            <p className="small">
              <strong>Apps</strong>: the <code>mark</code> CLI, the MCP server (<code>impl-mcp-dev</code>), the
              procedure server and this site.
            </p>
          </aside>
        )}
      </div>
    </>
  );
}
