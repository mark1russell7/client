import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource-variable/atkinson-hyperlegible-mono";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/status.css";
import "./styles/lab.css";
import "./styles/graph.css";
import "./styles/home.css";
import "./styles/journey.css";
import "./styles/command.css";
import "./styles/docs.css";
import "./styles/gallery.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { mountApp } from "./lib/prerender-handoff";
import { currentRoute, legacyHashUrl, routePath } from "./lib/router";

// An old link of the site has its route in the hash (`#/catalog/git.status`). It moves to the
// path form before the first render, so the app and the saved HTML agree on the route.
const legacy = legacyHashUrl(window.location.hash);
if (legacy !== null) window.history.replaceState(window.history.state, "", legacy);

const root = document.getElementById("root");
if (root) {
  const { element, options } = mountApp(root, routePath(currentRoute()), undefined, window.location.search);
  createRoot(element, options).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
