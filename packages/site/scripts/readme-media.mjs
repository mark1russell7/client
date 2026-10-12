// The images of the README files, from the built site (after the AsyncBrowserContext site):
// - media/home.png: the top of the home page, with the live panel at its end state;
// - media/composer.png: the Composer with the "chain" example and its Graph tab;
// - media/live-program.gif: the live panel as it replays the calls of the program (ffmpeg).
//
// Usage: start the site (`pnpm build && pnpm preview`), then `node scripts/readme-media.mjs [url]`.
// The URL is the base of the site, by default http://localhost:4173/client/.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:4173/client/";
const out = fileURLToPath(new URL("../media/", import.meta.url));
mkdirSync(out, { recursive: true });

/** This function waits until the live app replaced the HTML of the build. */
async function settle(page) {
  await page.waitForFunction(() => document.querySelector("[data-prerendered]") === null, null, { timeout: 15_000 });
}

const browser = await chromium.launch();
try {
  // The stills, with the end state of the animations
  const still = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1.5, reducedMotion: "reduce", colorScheme: "light" });
  await still.goto(base);
  await settle(still);
  await still.locator(".hero-call.done").last().waitFor();
  await still.screenshot({ path: join(out, "home.png") });
  console.log("media/home.png");

  await still.goto(new URL("composer/?example=chain", base).href);
  await settle(still);
  await still.locator(".status-ok").waitFor();
  await still.getByRole("tab", { name: "Graph" }).click();
  await still.screenshot({ path: join(out, "composer.png") });
  console.log("media/composer.png");
  await still.close();

  // The animation of the live panel: one frame for each step of the replay
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, reducedMotion: "no-preference", colorScheme: "light" });
  await page.goto(base);
  await settle(page);
  const panel = page.locator(".live-hero");
  await panel.locator(".hero-call").first().waitFor();
  const frames = mkdtempSync(join(tmpdir(), "live-program-"));
  try {
    let index = 0;
    // The replay takes about 3.5 s: frames for 5 s, so the last frames show the result
    for (const end = Date.now() + 5000; Date.now() < end; index++) {
      await panel.screenshot({ path: join(frames, `frame-${String(index).padStart(3, "0")}.png`) });
      await page.waitForTimeout(150);
    }
    const target = join(out, "live-program.gif");
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-loglevel", "error",
        "-framerate", "6",
        "-i", join(frames, "frame-%03d.png"),
        "-vf", "fps=6,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=none",
        "-loop", "0",
        target,
      ],
      { stdio: "inherit" },
    );
    console.log("media/live-program.gif");
  } finally {
    rmSync(frames, { recursive: true, force: true });
  }
} finally {
  await browser.close();
}
