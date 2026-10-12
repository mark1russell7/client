/**
 * The docs pages: the guides, the documents of the client library and the README of each
 * package, from the Markdown of the repository (`scripts/docs-data.mjs` converts them at build
 * time). A JSON program in a page opens in the Composer, and a small one runs on the page.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { BASE_MARKER, DOC_SECTIONS, docBySlug, docs, neighbours, type DocMeta, type DocPage, type DocSegment } from "../data/docs";
import { loadDoc } from "../data/docs-content";
import { formatValue } from "../lib/display";
import { encodeProgram, type Json } from "../lib/program";
import { BASE, docHref, href, type Route } from "../lib/router";
import { metaOf, registerDocDescriptions } from "../lib/seo";
import type { ProgramRunner } from "../lib/runner";
import type { RunResult } from "../lib/runtime";
import { NotFound } from "./NotFound";

const REPOSITORY_BLOB = "https://github.com/mark1russell7/client/blob/main/";

// The descriptions of the docs pages are in this chunk, not in the main bundle: from now on the
// meta data of a docs page has its real description
registerDocDescriptions(docs.map((doc) => [doc.slug, doc.description] as const));

/** The HTML of a page with the base of the site in its links. */
function withBase(html: string): string {
  return html.split(BASE_MARKER).join(BASE);
}

function Sidebar({ current }: { current: string }): ReactElement {
  const currentSection = docBySlug(current)?.section;
  return (
    <nav className="docs-sidebar" aria-label="Docs pages">
      <a className="docs-sidebar-home" href={docHref("")} aria-current={current === "" ? "page" : undefined}>
        All docs
      </a>
      {DOC_SECTIONS.map((section) => {
        const items = docs.filter((doc) => doc.section === section);
        if (items.length === 0) return null;
        const list = (
          <ul>
            {items.map((doc) => (
              <li key={doc.slug}>
                <a href={docHref(doc.slug)} aria-current={doc.slug === current ? "page" : undefined}>
                  {doc.package ?? doc.title}
                </a>
              </li>
            ))}
          </ul>
        );
        // The list of the packages is long: it is open when the page is one of them
        return section === "Packages" ? (
          <details key={section} open={currentSection === section || current === ""}>
            <summary>
              {section} <span className="muted">({items.length})</span>
            </summary>
            {list}
          </details>
        ) : (
          <div key={section} className="docs-sidebar-group">
            <h2>{section}</h2>
            {list}
          </div>
        );
      })}
    </nav>
  );
}

/** The table of contents of a page. The heading in view has `aria-current`. */
function Toc({ page }: { page: DocPage }): ReactElement | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || page.toc.length === 0) return;
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        const first = page.toc.find((heading) => visible.get(heading.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-56px 0px -60% 0px" },
    );
    for (const heading of page.toc) {
      const element = document.getElementById(heading.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [page]);
  if (page.toc.length === 0) return null;
  return (
    <nav className="docs-toc" aria-label="On this page">
      <h2>On this page</h2>
      <ul>
        {page.toc.map((heading) => (
          <li key={heading.id} className={heading.depth === 3 ? "toc-sub" : undefined}>
            <a href={`#${heading.id}`} aria-current={active === heading.id ? "location" : undefined}>
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The result of a run, as the page shows it. */
function resultText(result: RunResult): string {
  if (result.ok) return formatValue(result.value, 1200);
  return result.error ?? "The program failed.";
}

/**
 * A JSON program of a page: its code, a link that opens it in the Composer, and for a small
 * program whose procedures the browser has, a Run button. The program runs in a Web Worker
 * with a time limit (the runner of the Composer).
 */
function ProgramBlock({ segment, number }: { segment: Extract<DocSegment, { type: "program" }>; number: number }): ReactElement {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const runner = useRef<ProgramRunner | null>(null);
  useEffect(() => () => runner.current?.dispose(), []);
  const composer = useMemo(() => href("composer", undefined, { p: encodeProgram(segment.program as Json) }), [segment.program]);

  const run = async (): Promise<void> => {
    setRunning(true);
    setResult(null);
    try {
      const { ProgramRunner: Runner } = await import("../lib/runner");
      runner.current ??= new Runner();
      setResult(await runner.current.run(segment.program as Json));
    } finally {
      setRunning(false);
    }
  };

  return (
    <figure className="doc-program">
      <div className="doc-program-bar">
        <span className="doc-program-label">Program {number}</span>
        <span className="doc-program-actions">
          {segment.runnable ? (
            <button
              type="button"
              className="primary small-button"
              onClick={() => void run()}
              disabled={running}
              aria-label={`Run program ${number} on this page`}
            >
              {running ? "Running…" : "▶ Run"}
            </button>
          ) : null}
          <a className="ghost small-button" href={composer} aria-label={`Open program ${number} in the Composer`}>
            Open in the Composer
          </a>
        </span>
      </div>
      <div dangerouslySetInnerHTML={{ __html: segment.html }} />
      {segment.expected ? (
        <p className="doc-program-expected small">
          <span className="muted">The document gives:</span> <code>{segment.expected}</code>
        </p>
      ) : null}
      <output className="doc-program-result" aria-live="polite">
        {result ? (
          <>
            <span className={result.ok ? "doc-result-ok" : "doc-result-error"}>{result.ok ? "Result" : "Error"}</span>
            <code>{resultText(result)}</code>
            <span className="muted small">
              {result.calls.length + result.dropped} {result.calls.length + result.dropped === 1 ? "call" : "calls"}, {Math.max(1, Math.round(result.duration))} ms
            </span>
          </>
        ) : null}
      </output>
    </figure>
  );
}

function Segments({ page }: { page: DocPage }): ReactElement {
  let programs = 0;
  return (
    <div className="doc-content">
      {page.segments.map((segment, index) =>
        segment.type === "html" ? (
          <div key={index} dangerouslySetInnerHTML={{ __html: withBase(segment.html) }} />
        ) : (
          <ProgramBlock key={index} segment={segment} number={++programs} />
        ),
      )}
    </div>
  );
}

/** A package name that can break after its scope: "@mark1russell7/" then "client-git". */
function PackageName({ name }: { name: string }): ReactElement {
  const slash = name.indexOf("/");
  if (slash < 0) return <>{name}</>;
  return (
    <>
      {name.slice(0, slash + 1)}
      <wbr />
      {name.slice(slash + 1)}
    </>
  );
}

function PageLinks({ slug }: { slug: string }): ReactElement {
  const { previous, next } = neighbours(slug);
  return (
    <nav className="docs-pager" aria-label="Previous and next pages">
      {previous ? (
        <a className="docs-pager-previous" href={docHref(previous.slug)}>
          <span className="muted small">Previous</span>
          <span>{previous.package ?? previous.title}</span>
        </a>
      ) : (
        <span />
      )}
      {next ? (
        <a className="docs-pager-next" href={docHref(next.slug)}>
          <span className="muted small">Next</span>
          <span>{next.package ?? next.title}</span>
        </a>
      ) : null}
    </nav>
  );
}

function DocHeader({ doc }: { doc: DocMeta }): ReactElement {
  return (
    <header className="doc-header">
      <p className="doc-crumbs small">
        <a href={docHref("")}>Docs</a> <span aria-hidden="true">/</span> {doc.section}
      </p>
      <h1 id="doc-title">
        {doc.package ? (
          <code>
            <PackageName name={doc.packageName ?? doc.title} />
          </code>
        ) : (
          doc.title
        )}
      </h1>
      <p className="doc-meta small muted">
        <a href={`${REPOSITORY_BLOB}${doc.source}`}>
          <code>{doc.source}</code> on GitHub
        </a>
        {doc.package ? (
          <>
            {" · "}
            <a href={href("architecture", doc.package)}>Package map</a>
            {" · "}
            <a href={href("catalog", undefined, { package: doc.package })}>Procedures</a>
          </>
        ) : null}
      </p>
    </header>
  );
}

/** One docs page. The page is busy (`data-loading`) until its content arrives. */
function DocView({ slug, route }: { slug: string; route: Route }): ReactElement {
  const doc = docBySlug(slug);
  const [page, setPage] = useState<DocPage | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    setPage(undefined);
    loadDoc(slug).then(
      (loaded) => current && setPage(loaded ?? null),
      () => current && setPage(null),
    );
    return () => {
      current = false;
    };
  }, [slug]);
  // The first page of a visit got its description before this chunk loaded: set the real one
  useEffect(() => {
    const description = metaOf({ page: "docs", rest: slug })?.description;
    if (description) document.head.querySelector('meta[name="description"]')?.setAttribute("content", description);
  }, [slug, page]);
  // A link with an anchor ("#the-ref-key") goes to its heading when the content is on the page,
  // also after a navigation inside the same page (a new route object, the same content)
  useEffect(() => {
    if (!page) return;
    let id = window.location.hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // Keep the text
    }
    if (id) document.getElementById(id)?.scrollIntoView();
  }, [page, route]);

  if (!doc || page === null) return <NotFound path={`docs/${slug}`} />;
  return (
    <div className="docs-layout">
      <Sidebar current={slug} />
      <article className="docs-article" aria-labelledby="doc-title">
        <DocHeader doc={doc} />
        {page === undefined ? (
          <div className="page-loading" data-loading="" aria-busy="true">
            <p className="muted small">Loading the page…</p>
          </div>
        ) : (
          <>
            <Segments page={page} />
            <PageLinks slug={slug} />
          </>
        )}
      </article>
      {page ? <Toc page={page} /> : <span />}
    </div>
  );
}

function DocsIndex(): ReactElement {
  return (
    <div className="docs-layout docs-layout-index">
      <Sidebar current="" />
      <div className="docs-article">
        <h1>Documentation</h1>
        <p className="doc-lead">
          The guides tell how to build, run and release the packages. The program format tells how a JSON program runs. Each
          package has its README. A JSON program in a page opens in the Composer, and a small one runs on the page.
        </p>
        {DOC_SECTIONS.map((section) => {
          const items = docs.filter((doc) => doc.section === section);
          if (items.length === 0) return null;
          return (
            <section key={section} aria-labelledby={`docs-${section}`}>
              <h2 id={`docs-${section}`}>{section}</h2>
              <ul className={section === "Packages" ? "docs-cards docs-cards-compact" : "docs-cards"}>
                {items.map((doc) => (
                  <li key={doc.slug}>
                    <a href={docHref(doc.slug)}>
                      <span className="docs-card-title">{doc.package ? <code>{doc.package}</code> : doc.title}</span>
                      <span className="docs-card-text small muted">{doc.packageDescription || doc.description}</span>
                      {doc.programs > 0 ? (
                        <span className="docs-card-badge small">
                          {doc.programs} {doc.programs === 1 ? "program" : "programs"}
                        </span>
                      ) : null}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function Docs({ route }: { route: Route }): ReactElement {
  return route.rest === "" ? <DocsIndex /> : <DocView slug={route.rest} route={route} />;
}
