import { lazy, Suspense, useEffect, useMemo, useState, type ReactElement } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { build, failedPackages } from "./data";
import { href, interceptLinks, routePath, useRoute } from "./lib/router";
import { metaOf, NOT_FOUND_META } from "./lib/seo";
import { NotFound } from "./pages/NotFound";
import { Home } from "./pages/Home";

// Each page other than the home page loads with its own code, so the first page loads less.
// The prerender waits for the code of the page (the fallback has data-loading).
const Composer = lazy(() => import("./pages/Composer").then((module) => ({ default: module.Composer })));
const Catalog = lazy(() => import("./pages/Catalog").then((module) => ({ default: module.Catalog })));
const Architecture = lazy(() => import("./pages/Architecture").then((module) => ({ default: module.Architecture })));
const Claude = lazy(() => import("./pages/Claude").then((module) => ({ default: module.Claude })));
const Status = lazy(() => import("./pages/Status").then((module) => ({ default: module.Status })));
const Lab = lazy(() => import("./pages/Lab").then((module) => ({ default: module.Lab })));

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
  { page: "catalog", label: "Procedures" },
  { page: "architecture", label: "Architecture" },
  { page: "lab", label: "Lab" },
  { page: "claude", label: "What Claude sees" },
  { page: "status", label: "Status" },
];

type Theme = "light" | "dark" | "system";

function readTheme(): Theme {
  try {
    const theme = localStorage.getItem("theme");
    return theme === "light" || theme === "dark" ? theme : "system";
  } catch {
    return "system";
  }
}

function ThemeToggle(): ReactElement {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset["theme"];
    else root.dataset["theme"] = theme;
    try {
      if (theme === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", theme);
    } catch {
      // The theme stays for this page only
    }
  }, [theme]);
  const next: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
  const label = theme === "system" ? "Auto" : theme === "light" ? "Light" : "Dark";
  return (
    <button
      type="button"
      className="ghost theme-toggle"
      onClick={() => setTheme(next[theme])}
      aria-label={`Theme: ${label}. Change the theme`}
      title="Change the theme"
    >
      <span aria-hidden="true">{theme === "system" ? "◐" : theme === "light" ? "○" : "●"}</span>
      <span className="theme-label"> {label}</span>
    </button>
  );
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
    case "lab":
      page = <Lab />;
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
          <a className="ghost github-link" href="https://github.com/mark1russell7/client">
            GitHub
          </a>
          <ThemeToggle />
        </div>
      </header>
      <main id="main" tabIndex={-1} className={["composer", "architecture", "status", "lab"].includes(route.page) ? "main wide" : "main"}>
        <ErrorBoundary resetKey={`${route.page}/${route.rest}?${route.query.toString()}`}>
          <Suspense fallback={<PageLoading />}>{page}</Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}
