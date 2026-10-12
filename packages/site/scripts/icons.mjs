// The PNG icons of the site, from public/favicon.svg: the icons of the web manifest, the Apple
// touch icon and a 32 px icon for browsers without SVG icons. Run it after a change of the
// favicon: `node scripts/icons.mjs`. The PNG files are in git, so the build needs no browser.

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));
const svg = readFileSync(join(root, "public", "favicon.svg"), "utf8");
const out = join(root, "public", "icons");
mkdirSync(out, { recursive: true });

// A maskable icon keeps its content in the middle 80 %: the mark sits on the brand color
const ICONS = [
  { file: "icon-32.png", size: 32, padding: 0, background: "transparent" },
  { file: "icon-192.png", size: 192, padding: 0, background: "transparent" },
  { file: "icon-512.png", size: 512, padding: 0, background: "transparent" },
  { file: "icon-maskable-512.png", size: 512, padding: 0.12, background: "#2346c4" },
  { file: "apple-touch-icon.png", size: 180, padding: 0.08, background: "#2346c4" },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const icon of ICONS) {
    await page.setViewportSize({ width: icon.size, height: icon.size });
    const inset = Math.round(icon.size * icon.padding);
    await page.setContent(
      `<html><body style="margin:0;background:${icon.background}"><div style="position:absolute;inset:${inset}px">${svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div></body></html>`,
    );
    await page.screenshot({ path: join(out, icon.file), omitBackground: icon.background === "transparent" });
    console.log(`public/icons/${icon.file}`);
  }
} finally {
  await browser.close();
}
