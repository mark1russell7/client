import { useEffect, useState, type ReactElement } from "react";
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
  return (
    <button type="button" className="ghost theme-toggle" onClick={() => setTheme(next[theme])} title="Change the theme">
      {theme === "system" ? "◐ Auto" : theme === "light" ? "○ Light" : "● Dark"}
    </button>
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
          <a className="ghost" href="https://github.com/mark1russell7/client">
            GitHub
          </a>
          <ThemeToggle />
        </div>
      </header>
      <main className={route.page === "composer" || route.page === "architecture" ? "main wide" : "main"}>{page}</main>
    </div>
  );
}
