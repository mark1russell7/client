import { useEffect, useState, type ReactElement } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { build, failedPackages } from "./data";
import { href, useRoute } from "./lib/router";
import { Home } from "./pages/Home";
import { Composer } from "./pages/Composer";
import { Catalog } from "./pages/Catalog";
import { Architecture } from "./pages/Architecture";
import { Claude } from "./pages/Claude";

const NAV: Array<{ page: string; label: string }> = [
  { page: "composer", label: "Composer" },
  { page: "catalog", label: "Procedures" },
  { page: "architecture", label: "Architecture" },
  { page: "claude", label: "What Claude sees" },
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

export function App(): ReactElement {
  const route = useRoute();
  useEffect(() => {
    const label = NAV.find((item) => item.page === route.page)?.label;
    document.title = label ? `${label} · client` : "client: procedures as data";
  }, [route.page]);

  let page: ReactElement;
  switch (route.page) {
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
      <main id="main" tabIndex={-1} className={route.page === "composer" || route.page === "architecture" ? "main wide" : "main"}>
        <ErrorBoundary resetKey={`${route.page}/${route.rest}?${route.query.toString()}`}>{page}</ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}
