/**
 * The Open Graph image of each page: 1200 × 630 pixels, in the colors and the fonts of the site
 * (after the AsyncBrowserContext site). The motif is a chain program as a tree of calls on graph
 * paper, with a `$ref` that reads the result of an earlier step.
 *
 * The build loads the page of the image one time (the fonts are in it), then fills the text of
 * each card with `window.__card(card)` and takes a screenshot.
 */

import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, type SiteFacts } from "./head-tags";
import { escapeHtml, type StaticRoute } from "./static-routes";

/** The text of one Open Graph image. */
export interface OgCard {
  /** The line above the title, for example "Procedures / client-git". */
  eyebrow: string;
  title: string;
  description: string;
  siteName: string;
  /** The site address without the protocol, for example "mark1russell7.github.io/client". */
  address: string;
}

/** The web fonts of the image, as `src` values of `@font-face`. */
export interface OgFonts {
  sans: readonly string[];
  mono: readonly string[];
}

/** The light theme colors of `styles/tokens.css`. */
const COLORS = {
  page: "#f5f6f9",
  surface: "#ffffff",
  sunken: "#eef1f6",
  ink: "#151c2e",
  inkSecondary: "#454f67",
  inkMuted: "#5f6880",
  ruleStrong: "#aeb6c7",
  grid: "#e7eaf1",
  accent: "#2346c4",
  accentWash: "#e7ecfd",
  good: "#006300",
};

/** The text of the image of a route. */
export function ogCard(route: StaticRoute, site: SiteFacts): OgCard {
  const url = new URL(site.url);
  const address = `${url.host}${url.pathname}`.replace(/\/$/, "");
  let eyebrow: string;
  if (route.path === "") eyebrow = `TypeScript library · ${site.license} license`;
  else if (route.path.startsWith("catalog/")) eyebrow = "Procedures";
  else if (route.path.startsWith("architecture/")) eyebrow = "Architecture / package";
  else if (route.path.startsWith("docs/packages/")) eyebrow = "Docs / package README";
  else if (route.path.startsWith("docs/")) eyebrow = "Docs";
  else eyebrow = route.section || route.heading;
  // A zero-width space after each slash: a package name breaks after its scope, not in a word
  return { eyebrow, title: route.heading.replace(/\//g, "/​"), description: route.description, siteName: site.name, address };
}

function fontFaces(family: string, sources: readonly string[]): string {
  return sources.map((source) => `@font-face{font-family:"${family}";src:${source};font-weight:200 800;font-style:normal;font-display:block}`).join("\n");
}

interface Node {
  x: number;
  y: number;
  name: string;
  detail: string;
  result: string;
  kind: "root" | "step" | "later";
}

function node(box: Node): string {
  const width = box.kind === "root" ? 220 : 252;
  const height = box.kind === "root" ? 52 : 66;
  const stroke = box.kind === "root" ? COLORS.accent : COLORS.ruleStrong;
  const ring =
    box.kind === "root"
      ? `<rect x="${box.x - 4}" y="${box.y - 4}" width="${width + 8}" height="${height + 8}" rx="11" fill="none" stroke="${COLORS.accentWash}" stroke-width="6"/>`
      : "";
  const chip = box.result
    ? `<rect x="${box.x + width - 66}" y="${box.y + height - 30}" width="54" height="22" rx="11" fill="${COLORS.accentWash}"/>
       <text x="${box.x + width - 39}" y="${box.y + height - 14.5}" text-anchor="middle" class="result">${escapeHtml(box.result)}</text>`
    : "";
  return `<g${box.kind === "later" ? ` opacity="0.45"` : ""}>
    ${ring}
    <rect x="${box.x}" y="${box.y}" width="${width}" height="${height}" rx="8" fill="${COLORS.surface}" stroke="${stroke}" stroke-width="2"${box.kind === "later" ? ` stroke-dasharray="3 5"` : ""}/>
    <text x="${box.x + 16}" y="${box.y + 28}" class="name">${escapeHtml(box.name)}</text>
    ${box.detail ? `<text x="${box.x + 16}" y="${box.y + 50}" class="detail">${box.detail}</text>` : ""}
    ${chip}
  </g>`;
}

/**
 * The motif: a chain with two steps. The second step reads the result of the first with
 * `{ "$ref": "sum" }`: the dashed arrow. The third step comes later.
 */
function callTree(): string {
  const rail = (y: number): string => `<path d="M72 118V${y}H96" fill="none" stroke="${COLORS.inkMuted}" stroke-width="1.75"/>`;
  const ref = `<tspan class="ref">$ref</tspan>`;
  return `<svg width="400" height="506" viewBox="0 0 400 506" aria-hidden="true">
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10Z" fill="${COLORS.accent}"/>
      </marker>
    </defs>
    <rect x="28" y="22" width="344" height="44" rx="8" fill="${COLORS.sunken}"/>
    <text x="44" y="49" class="code">{ "$proc": ["client", "chain"] }</text>
    ${rail(186)}
    ${rail(286)}
    ${rail(386)}
    ${node({ x: 52, y: 76, name: "client.chain", detail: "", result: "", kind: "root" })}
    ${node({ x: 96, y: 153, name: "client.add", detail: "a: 2, b: 3", result: "5", kind: "step" })}
    ${node({ x: 96, y: 253, name: "client.multiply", detail: `a: ${ref} sum, b: 6`, result: "30", kind: "step" })}
    ${node({ x: 96, y: 353, name: "client.format", detail: `value: ${ref} $last`, result: "", kind: "later" })}
    <path d="M352 186C376 206 376 248 352 276" fill="none" stroke="${COLORS.accent}" stroke-width="1.75" stroke-dasharray="5 5" marker-end="url(#arrow)"/>
    <text x="200" y="470" text-anchor="middle" class="caption">a program is JSON <tspan class="caption-arrow">→</tspan> <tspan class="caption-value">30</tspan></text>
  </svg>`;
}

/**
 * The HTML page that the build renders to PNG files of 1200 × 630 pixels. `window.__card(card)`
 * fills the text, makes the title smaller until it fits in three lines, and resolves when the
 * page is ready for the screenshot.
 */
export function ogImageHtml(fonts: OgFonts): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
${fontFaces("Atkinson Hyperlegible Next", fonts.sans)}
${fontFaces("Atkinson Hyperlegible Mono", fonts.mono)}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${OG_IMAGE_WIDTH}px; height: ${OG_IMAGE_HEIGHT}px; overflow: hidden; }
body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 400px;
  gap: 56px;
  padding: 62px 62px 62px 72px;
  background: ${COLORS.page};
  color: ${COLORS.ink};
  font-family: "Atkinson Hyperlegible Next", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.text { display: grid; grid-template-rows: auto 1fr auto; min-width: 0; }
.brand { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 800; letter-spacing: -0.02em; }
.mark { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 10px; background: ${COLORS.accent}; color: ${COLORS.surface}; font-family: "Atkinson Hyperlegible Mono", monospace; font-size: 22px; font-weight: 700; }
.main { min-width: 0; align-self: center; padding-bottom: 4px; }
.eyebrow { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; color: ${COLORS.accent}; font-family: "Atkinson Hyperlegible Mono", monospace; font-size: 22px; font-weight: 600; }
.eyebrow::before { content: ""; width: 28px; height: 3px; border-radius: 2px; background: ${COLORS.accent}; }
.title { font-size: 68px; font-weight: 800; line-height: 1.06; letter-spacing: -0.03em; text-wrap: balance; overflow-wrap: anywhere; }
.description { display: -webkit-box; margin-top: 24px; overflow: hidden; color: ${COLORS.inkSecondary}; font-size: 26px; line-height: 1.42; text-wrap: pretty; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.address { display: flex; align-items: center; gap: 12px; padding-top: 18px; border-top: 1.5px solid ${COLORS.ruleStrong}; color: ${COLORS.inkMuted}; font-family: "Atkinson Hyperlegible Mono", monospace; font-size: 21px; }
.panel {
  position: relative;
  overflow: hidden;
  border: 1.5px solid ${COLORS.ruleStrong};
  border-radius: 12px;
  background-color: ${COLORS.surface};
  background-image: linear-gradient(${COLORS.grid} 1px, transparent 1px), linear-gradient(90deg, ${COLORS.grid} 1px, transparent 1px);
  background-size: 20px 20px;
  background-position: -1px -1px;
}
.panel svg { position: absolute; inset: 0; }
.code { fill: ${COLORS.inkSecondary}; font-family: "Atkinson Hyperlegible Mono", monospace; font-size: 15px; }
.name { fill: ${COLORS.ink}; font-family: "Atkinson Hyperlegible Mono", monospace; font-size: 17px; font-weight: 700; }
.detail { fill: ${COLORS.inkSecondary}; font-family: "Atkinson Hyperlegible Mono", monospace; font-size: 14px; }
.ref { fill: ${COLORS.accent}; font-weight: 700; }
.result { fill: ${COLORS.accent}; font-family: "Atkinson Hyperlegible Mono", monospace; font-size: 14px; font-weight: 700; }
.caption { fill: ${COLORS.inkSecondary}; font-family: "Atkinson Hyperlegible Mono", monospace; font-size: 17px; }
.caption-arrow { fill: ${COLORS.inkMuted}; }
.caption-value { fill: ${COLORS.good}; font-weight: 700; }
</style>
</head>
<body>
  <div class="text">
    <div class="brand"><span class="mark" aria-hidden="true">⟨⟩</span><span id="site"></span></div>
    <div class="main">
      <p class="eyebrow" id="eyebrow"></p>
      <h1 class="title" id="title"></h1>
      <p class="description" id="description"></p>
    </div>
    <div class="address" id="address"></div>
  </div>
  <div class="panel">${callTree()}</div>
  <script>
    window.__card = function (card) {
      document.getElementById("site").textContent = card.siteName;
      document.getElementById("eyebrow").textContent = card.eyebrow;
      document.getElementById("description").textContent = card.description;
      document.getElementById("address").textContent = card.address;
      var title = document.getElementById("title");
      title.textContent = card.title;
      return document.fonts.ready.then(function () {
        var size = 68;
        title.style.fontSize = size + "px";
        while (size > 36 && (title.getBoundingClientRect().height > size * 1.06 * 3 + 2 || title.scrollWidth > title.clientWidth)) {
          size -= 2;
          title.style.fontSize = size + "px";
        }
      });
    };
  </script>
</body>
</html>
`;
}
