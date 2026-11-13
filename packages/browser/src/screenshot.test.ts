import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CommandOptions, CommandResult } from "@procedures/shell/command";
import type { CommandRunner } from "./run.js";
import { isImageFile, renderScreenshot, renderScreenshotBytes, screenshotArgs, screenshotFormatOf, type ScreenshotFormat } from "./screenshot.js";

const SIGNATURES: Readonly<Record<ScreenshotFormat, Buffer>> = {
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]),
  webp: Buffer.concat([Buffer.from("RIFF"), Buffer.from([36, 0, 0, 0]), Buffer.from("WEBPVP8 ")]),
};
const OK: CommandResult = { exitCode: 0, stdout: "", stderr: "", success: true, duration: 1 };

interface Call {
  readonly command: string;
  readonly options: CommandOptions;
  readonly page: string;
}

const flag = (args: readonly string[], name: string): string | undefined => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

/** A runner that acts as a browser: it writes a picture of the format of the extension to the path of --screenshot. */
function fakeBrowser(content?: Buffer | null): { runner: CommandRunner; calls: Call[] } {
  const calls: Call[] = [];
  const runner: CommandRunner = async (command, options) => {
    const args = options.args ?? [];
    const out = flag(args, "--screenshot")!;
    const page = args.at(-1)!;
    calls.push({ command, options, page: page.startsWith("file:") ? readFileSync(fileURLToPath(page), "utf8") : page });
    const format = screenshotFormatOf(out);
    if (content !== null) writeFileSync(out, content ?? SIGNATURES[format]);
    return OK;
  };
  return { runner, calls };
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "screenshot-test-"));
}

describe("screenshotFormatOf", () => {
  it("takes the format of the extension, else the option, else png", () => {
    expect(screenshotFormatOf()).toBe("png");
    expect(screenshotFormatOf(undefined, "webp")).toBe("webp");
    expect(screenshotFormatOf("a/b.PNG")).toBe("png");
    expect(screenshotFormatOf("b.jpg")).toBe("jpeg");
    expect(screenshotFormatOf("b.jpeg", "jpeg")).toBe("jpeg");
    expect(screenshotFormatOf("b.webp")).toBe("webp");
  });

  it("refuses an unknown extension and a format that disagrees with the extension", () => {
    expect(() => screenshotFormatOf("b.gif")).toThrow(/\.png, \.jpg, \.jpeg or \.webp, not "\.gif"/);
    expect(() => screenshotFormatOf("b")).toThrow(/not ""/);
    expect(() => screenshotFormatOf("b.png", "jpeg")).toThrow(/is a png file, and the format is jpeg/);
  });
});

describe("screenshotArgs", () => {
  it("gives the flags of a headless screenshot, the size, the budget, the extra flags, then the page", () => {
    expect(screenshotArgs("https://example.com/", "/out/a.png", "/tmp/profile", { width: 640, height: 480 }, 2000, ["--no-sandbox"])).toEqual([
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--mute-audio",
      "--no-first-run",
      "--user-data-dir=/tmp/profile",
      "--window-size=640,480",
      "--virtual-time-budget=2000",
      "--screenshot=/out/a.png",
      "--no-sandbox",
      "https://example.com/",
    ]);
    expect(screenshotArgs("p", "o", "d", { width: 1, height: 2 })).not.toContain(expect.stringMatching(/^--virtual-time-budget/));
  });
});

describe("isImageFile", () => {
  it("reads the signature of each format", () => {
    const dir = scratch();
    for (const [format, signature] of Object.entries(SIGNATURES) as [ScreenshotFormat, Buffer][]) {
      const path = join(dir, `a.${format}`);
      writeFileSync(path, signature);
      for (const other of Object.keys(SIGNATURES) as ScreenshotFormat[]) expect(isImageFile(path, other)).toBe(other === format);
    }
    writeFileSync(join(dir, "short"), Buffer.from([0x89, 0x50]));
    expect(isImageFile(join(dir, "short"), "png")).toBe(false);
    writeFileSync(join(dir, "riff"), Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WAVE")]));
    expect(isImageFile(join(dir, "riff"), "webp")).toBe(false);
  });
});

describe("renderScreenshot", () => {
  it("loads an address in a window of the default size, and gives a png file in a temporary folder", async () => {
    const { runner, calls } = fakeBrowser();
    const result = await renderScreenshot({ url: "https://example.com/a?b=c", executable: "/opt/browser", runner });
    expect(result).toMatchObject({ format: "png", browser: "/opt/browser", bytes: SIGNATURES.png.length });
    expect(extname(result.path)).toBe(".png");
    expect(calls[0]!.page).toBe("https://example.com/a?b=c");
    expect(flag(calls[0]!.options.args ?? [], "--window-size")).toBe("1280,800");
    expect(calls[0]!.options.timeout).toBe(60_000);
    // The profile goes, the picture stays
    expect(existsSync(join(dirname(result.path), "profile"))).toBe(false);
    expect(readFileSync(result.path).equals(SIGNATURES.png)).toBe(true);
  });

  it("writes the HTML text to a temporary page, with the size and the budget of the options", async () => {
    const { runner, calls } = fakeBrowser();
    const result = await renderScreenshot({ html: "<h1>Card</h1>", format: "jpeg", size: { width: 320, height: 200 }, budget: 1500, executable: "/opt/browser", runner });
    expect(result.format).toBe("jpeg");
    expect(extname(result.path)).toBe(".jpg");
    expect(calls[0]!.page).toBe("<h1>Card</h1>");
    expect(flag(calls[0]!.options.args ?? [], "--window-size")).toBe("320,200");
    expect(flag(calls[0]!.options.args ?? [], "--virtual-time-budget")).toBe("1500");
    expect(existsSync(join(dirname(result.path), "page.html"))).toBe(false);
  });

  it("takes an HTML file, and writes the format of the extension of the output", async () => {
    const dir = scratch();
    const page = join(dir, "card.html");
    writeFileSync(page, "<p>Card</p>");
    const output = join(dir, "out", "card.webp");
    const { runner, calls } = fakeBrowser();
    const result = await renderScreenshot({ file: page, output, executable: "/opt/browser", runner });
    expect(result).toMatchObject({ path: output, format: "webp" });
    expect(calls[0]!.page).toBe("<p>Card</p>");
    expect(readFileSync(output).equals(SIGNATURES.webp)).toBe(true);
  });

  it("keeps an old output file when the picture is not of the format", async () => {
    const dir = scratch();
    const output = join(dir, "old.png");
    writeFileSync(output, SIGNATURES.png);
    const { runner } = fakeBrowser(SIGNATURES.jpeg);
    await expect(renderScreenshot({ html: "x", output, executable: "/opt/browser", runner })).rejects.toThrow(/is not a PNG file/);
    expect(readFileSync(output).equals(SIGNATURES.png)).toBe(true);
    const none = fakeBrowser(null);
    await expect(renderScreenshot({ html: "x", output, executable: "/opt/browser", runner: none.runner })).rejects.toThrow(/made no PNG file \(exit code 0\)/);
  });

  it("needs exactly one page", async () => {
    const { runner, calls } = fakeBrowser();
    await expect(renderScreenshot({ executable: "/opt/browser", runner })).rejects.toThrow(/one of url, html and file/);
    await expect(renderScreenshot({ url: "https://a.example/", html: "x", executable: "/opt/browser", runner })).rejects.toThrow(/one of url, html and file/);
    expect(calls).toHaveLength(0);
  });

  it("refuses an address that is not http, https or file, so a flag never reaches the browser", async () => {
    const { runner, calls } = fakeBrowser();
    for (const url of ["--remote-debugging-port=9222", "javascript:alert(1)", "data:text/html,x", "example.com", ""]) {
      await expect(renderScreenshot({ url, executable: "/opt/browser", runner })).rejects.toThrow(/an http, https or file address/);
    }
    expect(calls).toHaveLength(0);
  });

  it("refuses a size or a budget that is not a positive integer", async () => {
    const { runner, calls } = fakeBrowser();
    for (const size of [{ width: 0, height: 10 }, { width: 10.5, height: 10 }, { width: 10, height: 16_385 }, { width: Number.NaN, height: 1 }]) {
      await expect(renderScreenshot({ html: "x", size, executable: "/opt/browser", runner })).rejects.toThrow(/integers from 1 to 16384/);
    }
    for (const budget of [0, -1, 1.5]) {
      await expect(renderScreenshot({ html: "x", budget, executable: "/opt/browser", runner })).rejects.toThrow(/positive integer of milliseconds/);
    }
    expect(calls).toHaveLength(0);
  });

  it("refuses an output with an extension that is not of a format, before it starts the browser", async () => {
    const { runner, calls } = fakeBrowser();
    await expect(renderScreenshot({ html: "x", output: "a.gif", executable: "/opt/browser", runner })).rejects.toThrow(/not "\.gif"/);
    await expect(renderScreenshot({ html: "x", output: "a.png", format: "webp", executable: "/opt/browser", runner })).rejects.toThrow(/format is webp/);
    expect(calls).toHaveLength(0);
  });

  it("tells how to name a browser when it finds none", async () => {
    await expect(renderScreenshot({ html: "x", env: { PATH: "" }, platform: "linux", exists: () => false })).rejects.toThrow(/No browser found.*PDF_BROWSER/);
  });
});

describe("renderScreenshotBytes", () => {
  it("gives the picture as bytes, and removes its temporary folder", async () => {
    const folder = scratch();
    const { runner, calls } = fakeBrowser();
    const result = await renderScreenshotBytes({ url: "https://example.com/", executable: "/opt/browser", runner, folder });
    expect(result.format).toBe("png");
    expect(result.browser).toBe("/opt/browser");
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(result.data).equals(SIGNATURES.png)).toBe(true);
    expect(calls[0]!.page).toBe("https://example.com/");
    expect(readdirSync(folder)).toEqual([]);
  });

  it("takes the format, the size and the budget of the options", async () => {
    const folder = scratch();
    const { runner, calls } = fakeBrowser();
    const result = await renderScreenshotBytes({ html: "<h1>Card</h1>", format: "jpeg", size: { width: 320, height: 200 }, budget: 1500, executable: "/opt/browser", runner, folder });
    expect(result.format).toBe("jpeg");
    expect(Buffer.from(result.data).equals(SIGNATURES.jpeg)).toBe(true);
    expect(calls[0]!.page).toBe("<h1>Card</h1>");
    expect(flag(calls[0]!.options.args ?? [], "--window-size")).toBe("320,200");
    expect(flag(calls[0]!.options.args ?? [], "--virtual-time-budget")).toBe("1500");
    expect(readdirSync(folder)).toEqual([]);
  });

  it("removes its temporary folder when the render fails, and gives the error of renderScreenshot", async () => {
    const folder = scratch();
    const wrong = fakeBrowser(SIGNATURES.jpeg);
    await expect(renderScreenshotBytes({ html: "x", executable: "/opt/browser", runner: wrong.runner, folder })).rejects.toThrow(/is not a PNG file/);
    const none = fakeBrowser(null);
    await expect(renderScreenshotBytes({ html: "x", format: "webp", executable: "/opt/browser", runner: none.runner, folder })).rejects.toThrow(/made no WEBP file/);
    const cancelled: CommandRunner = async () => ({ ...OK, aborted: true });
    await expect(renderScreenshotBytes({ html: "x", executable: "/opt/browser", runner: cancelled, folder })).rejects.toThrow(/cancelled/);
    expect(readdirSync(folder)).toEqual([]);
  });

  it("refuses the options that renderScreenshot refuses, before it starts the browser", async () => {
    const folder = scratch();
    const { runner, calls } = fakeBrowser();
    await expect(renderScreenshotBytes({ executable: "/opt/browser", runner, folder })).rejects.toThrow(/one of url, html and file/);
    await expect(renderScreenshotBytes({ url: "--remote-debugging-port=9222", executable: "/opt/browser", runner, folder })).rejects.toThrow(/an http, https or file address/);
    await expect(renderScreenshotBytes({ html: "x", size: { width: 0, height: 1 }, executable: "/opt/browser", runner, folder })).rejects.toThrow(/integers from 1 to 16384/);
    await expect(renderScreenshotBytes({ html: "x", env: { PATH: "" }, platform: "linux", exists: () => false, folder })).rejects.toThrow(/No browser found/);
    expect(calls).toHaveLength(0);
    expect(readdirSync(folder)).toEqual([]);
  });
});
