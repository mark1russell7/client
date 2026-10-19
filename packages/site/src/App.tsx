import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { build, failedPackages } from "./data";
import { href, interceptLinks, routePath, useRoute } from "./lib/router";
import { metaOf, NOT_FOUND_META } from "./lib/seo";
import { cycleTheme, THEME_LABEL, useTheme } from "./lib/theme";
import { NotFound } from "./pages/NotFound";
import { Home } from "./pages/Home";

// Each page other than the home page loads with its own code, so the first page loads less.
// The prerender waits for the code of the page (the fallback has data-loading).
const Composer = lazy(() => import("./pages/Composer").then((module) => ({ default: module.Composer })));
const Catalog = lazy(() => import("./pages/Catalog").then((module) => ({ default: module.Catalog })));
const Architecture = lazy(() => import("./pages/Architecture").then((module) => ({ default: module.Architecture })));
const Claude = lazy(() => import("./pages/Claude").then((module) => ({ default: module.Claude })));
const Status = lazy(() => import("./pages/Status").then((module) => ({ default: module.Status })));
const Releases = lazy(() => import("./pages/Releases").then((module) => ({ default: module.Releases })));
const Lab = lazy(() => import("./pages/Lab").then((module) => ({ default: module.Lab })));
const Docs = lazy(() => import("./pages/Docs").then((module) => ({ default: module.Docs })));
const CommandPalette = lazy(() => import("./components/CommandPalette").then((module) => ({ default: module.CommandPalette })));

/** The page while its code loads. */
function PageLoading(): ReactElement {
  return (
    <div className="page-loading" data-loading="" aria-busy="true">
      <p className="muted small">Loading the page…</p>
    </div>
  );
}

const NAV: Array<{ page: string; label: string }> = [
  { page: "composer", label: "Composer" },
  { page: "docs", label: "Docs" },
  { page: "catalog", label: "Procedures" },
  { page: "architecture", label: "Architecture" },
  { page: "lab", label: "Lab" },
  { page: "claude", label: "What Claude sees" },
  { page: "status", label: "Status" },
  { page: "releases", label: "Releases" },
];

function ThemeToggle(): ReactElement {
  const theme = useTheme();
  const label = THEME_LABEL[theme];
  return (
    <button
      type="button"
      className="ghost theme-toggle"
      onClick={() => cycleTheme()}
      aria-label={`Theme: ${label}. Change the theme`}
      title="Change the theme"
    >
      <span aria-hidden="true">{theme === "system" ? "◐" : theme === "light" ? "○" : "●"}</span>
      <span className="theme-label"> {label}</span>
    </button>
  );
}

/** "⌘K" on a Mac, "Ctrl K" elsewhere. */
function shortcutLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl K";
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K";
}

/**
 * The command palette: Ctrl+K (⌘K on a Mac) or the search button opens it. Its code loads the
 * first time it opens. When it closes, the focus goes back to where it was.
 */
function useCommandPalette(): { open: boolean; show: () => void; hide: () => void } {
  const [open, setOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const show = useCallback(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    setOpen(false);
    const target = returnFocus.current;
    returnFocus.current = null;
    // After the dialog leaves the page
    setTimeout(() => target?.isConnected && target.focus(), 0);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) hide();
        else show();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, show, hide]);
  return { open, show, hide };
}

function Footer(): ReactElement {
  const date = build.date ? new Date(build.date) : null;
  return (
    <footer className="site-footer">
      <p className="small muted">
        {build.commit ? (
          <>
            Built from{" "}
            <a href={`https://github.com/mark1russell7/client/commit/${build.commit}`}>
              <code>{build.commit.slice(0, 7)}</code>
            </a>
          </>
        ) : (
          "A local build"
        )}
        {/* The date of the commit in its own time zone */}
        {date && !Number.isNaN(date.getTime()) && build.date ? ` on ${build.date.slice(0, 10)}` : ""}.{" "}
        <a href="https://github.com/mark1russell7/client">Source on GitHub</a>.
      </p>
      {failedPackages.length > 0 ? (
        <p className="small error-text" role="note">
          ⚠ {failedPackages.length} {failedPackages.length === 1 ? "package" : "packages"} did not load when the catalog was made, so
          their procedures are not on this site: {failedPackages.map((failure) => `${failure.package} (${failure.error})`).join("; ")}
        </p>
      ) : null}
    </footer>
  );
}

/** This function sets the content of a meta element of the head, when the element exists. */
function setMeta(selector: string, attribute: string, value: string): void {
  document.head.querySelector(selector)?.setAttribute(attribute, value);
}

export function App(): ReactElement {
  const route = useRoute();
  const meta = useMemo(() => metaOf(route), [route.page, route.rest]);
  const palette = useCommandPalette();
  const [shortcut, setShortcut] = useState("Ctrl K");
  useEffect(() => setShortcut(shortcutLabel()), []);
  // The router follows the links of the site with no reload
  useEffect(() => interceptLinks(), []);
  // The title and the description of the page, as the build writes them in its HTML file
  useEffect(() => {
    const current = meta ?? NOT_FOUND_META;
    document.title = current.title;
    setMeta('meta[name="description"]', "content", current.description);
  }, [meta]);

  let page: ReactElement;
  switch (meta === null ? "" : route.page) {
    case "":
      page = meta === null ? <NotFound path={routePath(route)} /> : <Home />;
      break;
    case "composer":
      page = <Composer route={route} />;
      break;
    case "catalog":
      page = <Catalog route={route} />;
      break;
    case "architecture":
      page = <Architecture route={route} />;
      break;
    case "claude":
      page = <Claude />;
      break;
    case "status":
      page = <Status route={route} />;
      break;
    case "releases":
      page = <Releases />;
      break;
    case "lab":
      page = <Lab />;
      break;
    case "docs":
      page = <Docs route={route} />;
      break;
    default:
      page = <Home />;
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main" onClick={(event) => {
        event.preventDefault();
        document.getElementById("main")?.focus();
      }}>
        Skip to the content
      </a>
      <header className="site-header">
        <a className="brand" href={href("")}>
          <span className="brand-mark" aria-hidden="true">
            ⟨⟩
          </span>
          client
        </a>
        <nav aria-label="Main">
          {NAV.map((item) => (
            <a key={item.page} href={href(item.page)} aria-current={route.page === item.page ? "page" : undefined}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="header-end">
          <button
            type="button"
            className="search-button"
            onClick={palette.show}
            aria-haspopup="dialog"
            aria-keyshortcuts="Control+K Meta+K"
            title={`Search the site (${shortcut})`}
          >
            <span aria-hidden="true">⌕</span>
            <span className="search-label">Search</span>
            <kbd className="search-kbd">{shortcut}</kbd>
          </button>
          <a className="ghost github-link" href="https://github.com/mark1russell7/client">
            GitHub
          </a>
          <ThemeToggle />
        </div>
      </header>
      <main id="main" tabIndex={-1} className={["composer", "architecture", "status", "lab", "docs"].includes(route.page) ? "main wide" : "main"}>
        <ErrorBoundary resetKey={`${route.page}/${route.rest}?${route.query.toString()}`}>
          <Suspense fallback={<PageLoading />}>{page}</Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      {palette.open ? (
        <Suspense fallback={null}>
          <CommandPalette onClose={palette.hide} />
        </Suspense>
      ) : null}
    </div>
  );
}
