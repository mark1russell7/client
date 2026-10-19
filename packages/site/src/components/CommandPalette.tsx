/**
 * The command palette (Ctrl+K or ⌘K): one search box for the pages, the procedures, the
 * packages, the examples and a few actions. It follows the ARIA combobox pattern: the focus stays
 * in the input, the arrow keys move the active option, Enter runs it, and Escape closes the
 * palette and gives the focus back.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { packages, procedures } from "../data";
import { examples } from "../lib/examples";
import { encodeProgram } from "../lib/program";
import { docHref, href, navigate } from "../lib/router";
import { docs } from "../data/docs";
import docSearchJson from "../data/generated/docs-search.js";
import { fuzzyScore, search } from "../lib/search";
import { cycleTheme, THEME_LABEL, NEXT_THEME, getTheme } from "../lib/theme";

type Kind = "page" | "doc" | "action" | "example" | "procedure" | "package";

interface Command {
  id: string;
  kind: Kind;
  label: string;
  hint: string;
  /** The text that the search reads. */
  text: string;
  run: () => void | Promise<void>;
}

const KIND_LABEL: Record<Kind, string> = {
  page: "Pages",
  doc: "Docs",
  action: "Actions",
  example: "Examples",
  procedure: "Procedures",
  package: "Packages",
};

const KIND_ORDER: Kind[] = ["page", "doc", "action", "example", "procedure", "package"];

const PAGES: Array<{ page: string; label: string; hint: string }> = [
  { page: "", label: "Home", hint: "What the client is, in five seconds" },
  { page: "composer", label: "Composer", hint: "Build a program from blocks and run it" },
  { page: "docs", label: "Docs", hint: "The guides, the program format and the package READMEs" },
  { page: "catalog", label: "Procedures", hint: "Search the procedures and their schemas" },
  { page: "architecture", label: "Architecture", hint: "The journey of one call, and the packages" },
  { page: "lab", label: "Middleware lab", hint: "Break a server and watch the middlewares" },
  { page: "claude", label: "What Claude sees", hint: "The MCP tools of Claude Code" },
  { page: "status", label: "Releases and status", hint: "The releases, the findings and the bugs, with their fixes" },
];

/** The headings of each docs page, for the search (`scripts/docs-data.mjs`). */
const docHeadings = docSearchJson as unknown as Array<{ slug: string; title: string; headings: Array<{ id: string; text: string }> }>;

function go(url: string): void {
  navigate(url);
}

function commands(onDone: (message: string) => void): Command[] {
  const list: Command[] = [];
  for (const page of PAGES) {
    list.push({ id: `page:${page.page}`, kind: "page", label: page.label, hint: page.hint, text: page.label, run: () => go(href(page.page)) });
  }
  list.push(
    {
      id: "action:new",
      kind: "action",
      label: "New program",
      hint: "An empty program in the Composer",
      text: "new program empty composer",
      run: () => go(href("composer", undefined, { p: encodeProgram(null) })),
    },
    {
      id: "action:copy",
      kind: "action",
      label: "Copy the link of this page",
      hint: "In the Composer, the link holds the program",
      text: "copy share link url",
      run: async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          onDone("The link is on the clipboard.");
        } catch {
          onDone("The browser did not let the page write to the clipboard.");
        }
      },
    },
    {
      id: "action:theme",
      kind: "action",
      label: `Change the theme to ${THEME_LABEL[NEXT_THEME[getTheme()]]}`,
      hint: "Light, dark, or the setting of the system",
      text: "theme dark light mode color",
      run: () => {
        const next = cycleTheme();
        onDone(`The theme is ${THEME_LABEL[next]}.`);
      },
    },
    {
      id: "action:github",
      kind: "action",
      label: "Open the source on GitHub",
      hint: "github.com/mark1russell7/client",
      text: "github source code repository",
      run: () => {
        window.location.href = "https://github.com/mark1russell7/client";
      },
    },
  );
  for (const example of examples) {
    list.push({
      id: `example:${example.id}`,
      kind: "example",
      label: example.title,
      hint: example.summary,
      text: `${example.title} example`,
      run: () => go(href("composer", undefined, { example: example.id })),
    });
  }
  for (const procedure of procedures) {
    list.push({
      id: `procedure:${procedure.key}`,
      kind: "procedure",
      label: procedure.key,
      hint: procedure.description,
      text: procedure.key,
      run: () => go(href("catalog", procedure.key)),
    });
  }
  // The docs pages, then each heading of each page (the headings load with the palette)
  for (const doc of docs) {
    list.push({
      id: `doc:${doc.slug}`,
      kind: "doc",
      label: doc.package ?? doc.title,
      hint: `${doc.section} · ${doc.packageDescription || doc.description}`,
      text: `${doc.title} ${doc.package ?? ""} docs`,
      run: () => go(docHref(doc.slug)),
    });
  }
  for (const entry of docHeadings) {
    for (const heading of entry.headings) {
      list.push({
        id: `doc:${entry.slug}#${heading.id}`,
        kind: "doc",
        label: heading.text,
        hint: `${entry.title} · docs`,
        text: `${heading.text} ${entry.title}`,
        run: () => go(docHref(entry.slug, heading.id)),
      });
    }
  }
  for (const pkg of packages) {
    list.push({
      id: `package:${pkg.dir}`,
      kind: "package",
      label: pkg.dir,
      hint: pkg.description,
      text: `${pkg.dir} ${pkg.name}`,
      run: () => go(href("architecture", pkg.dir)),
    });
  }
  return list;
}

/**
 * The matches of a query, grouped by kind: the group with the best match comes first. An empty
 * query gives the pages, the actions and the examples.
 */
function results(all: Command[], query: string): Array<{ kind: Kind; items: Command[] }> {
  const empty = query.trim() === "";
  const groups: Array<{ kind: Kind; items: Command[]; best: number }> = [];
  for (const kind of KIND_ORDER) {
    if (empty && (kind === "procedure" || kind === "package" || kind === "doc")) continue;
    const ofKind = all.filter((command) => command.kind === kind);
    const items = search(ofKind, query, kind === "procedure" ? 12 : kind === "doc" ? 8 : 6);
    if (items.length === 0) continue;
    groups.push({ kind, items, best: empty ? -KIND_ORDER.indexOf(kind) : (fuzzyScore(query, items[0]!.text) ?? 0) });
  }
  return groups.sort((a, b) => b.best - a.best);
}

export function CommandPalette({ onClose }: { onClose: () => void }): ReactElement {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const all = useMemo(() => commands(setMessage), []);
  const groups = useMemo(() => results(all, query), [all, query]);
  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => setActive(0), [query]);
  // The active option stays in view
  useEffect(() => {
    const option = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    option?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const runAt = (index: number): void => {
    const command = flat[index];
    if (!command) return;
    void Promise.resolve(command.run()).then(() => {
      if (command.kind !== "action" || command.id === "action:new" || command.id === "action:github") onClose();
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((value) => (flat.length === 0 ? 0 : (value + 1) % flat.length));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((value) => (flat.length === 0 ? 0 : (value - 1 + flat.length) % flat.length));
        break;
      case "Home":
        if (event.ctrlKey) {
          event.preventDefault();
          setActive(0);
        }
        break;
      case "End":
        if (event.ctrlKey) {
          event.preventDefault();
          setActive(Math.max(0, flat.length - 1));
        }
        break;
      case "Enter":
        event.preventDefault();
        runAt(active);
        break;
      case "Escape":
        event.preventDefault();
        onClose();
        break;
      case "Tab":
        // The focus stays in the dialog: the input is its one control
        event.preventDefault();
        break;
    }
  };

  let index = -1;
  return (
    <div className="command-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="command-input-row">
          <span className="command-glyph" aria-hidden="true">
            ⌕
          </span>
          <input
            ref={inputRef}
            className="command-input"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-autocomplete="list"
            aria-activedescendant={flat[active] ? `command-${active}` : undefined}
            aria-label="Search the pages, procedures, packages, examples and actions"
            placeholder="Search the site or run an action…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="command-escape">Esc</kbd>
        </div>
        <div id="command-list" role="listbox" aria-label="Results" className="command-list" ref={listRef}>
          {groups.map((group) => (
            <div key={group.kind} role="group" aria-labelledby={`command-group-${group.kind}`} className="command-group">
              <div id={`command-group-${group.kind}`} className="command-group-label" role="presentation">
                {KIND_LABEL[group.kind]}
              </div>
              {group.items.map((command) => {
                index++;
                const i = index;
                return (
                  <div
                    key={command.id}
                    id={`command-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={i === active}
                    className={`command-option kind-${command.kind}`}
                    onMouseMove={() => i !== active && setActive(i)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runAt(i)}
                  >
                    <span className="command-label">{command.label}</span>
                    {command.hint ? <span className="command-hint">{command.hint}</span> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {flat.length === 0 ? (
          <p className="command-empty small muted">
            Nothing matches “{query}”. Try a procedure name such as <code>git.status</code>.
          </p>
        ) : null}
        <div className="command-footer small muted">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close
          </span>
          <span role="status" aria-live="polite">
            {message}
          </span>
        </div>
      </div>
    </div>
  );
}
