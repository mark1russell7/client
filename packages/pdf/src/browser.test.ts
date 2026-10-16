import { describe, expect, it } from "vitest";
import { BROWSER_ENV, CHROME_PATH_ENV, browserCandidates, findBrowser } from "./browser.js";

const none = (): boolean => false;

describe("browserCandidates", () => {
  it("gives the Edge and Chrome folders of Windows first, then the PATH", () => {
    const candidates = browserCandidates("win32", {
      ProgramFiles: "D:\\Apps",
      "ProgramFiles(x86)": "D:\\Apps86",
      LOCALAPPDATA: "D:\\Users\\example\\AppData\\Local",
      Path: "D:\\bin;;E:\\tools",
    });
    expect(candidates.slice(0, 3)).toEqual([
      "D:\\Apps86\\Microsoft\\Edge\\Application\\msedge.exe",
      "D:\\Apps\\Microsoft\\Edge\\Application\\msedge.exe",
      "D:\\Apps\\Google\\Chrome\\Application\\chrome.exe",
    ]);
    expect(candidates).toContain("D:\\Users\\example\\AppData\\Local\\Chromium\\Application\\chrome.exe");
    expect(candidates.slice(-4)).toEqual(["D:\\bin\\msedge.exe", "D:\\bin\\chrome.exe", "E:\\tools\\msedge.exe", "E:\\tools\\chrome.exe"]);
  });

  it("uses the default Windows folders when the environment has none", () => {
    const candidates = browserCandidates("win32", {});
    expect(candidates[0]).toBe("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe");
    expect(candidates).toHaveLength(4);
  });

  it("gives the app bundles of macOS, also in the home folder", () => {
    const candidates = browserCandidates("darwin", { HOME: "/Users/example", PATH: "/usr/local/bin" });
    expect(candidates[0]).toBe("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    expect(candidates).toContain("/Users/example/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge");
    expect(candidates).toContain("/usr/local/bin/chromium");
  });

  it("gives the program names on the PATH of Linux", () => {
    const candidates = browserCandidates("linux", { PATH: "/usr/bin:/snap/bin" });
    expect(candidates[0]).toBe("/usr/bin/google-chrome");
    expect(candidates).toContain("/snap/bin/chromium");
    expect(candidates).toContain("/usr/bin/microsoft-edge");
    expect(browserCandidates("linux", {})).toEqual([]);
  });
});

describe("findBrowser", () => {
  it("uses the executable option first", () => {
    expect(findBrowser({ executable: "/opt/browser", env: { [BROWSER_ENV]: "/other" }, exists: none })).toBe("/opt/browser");
  });

  it("uses PDF_BROWSER, then CHROME_PATH", () => {
    expect(findBrowser({ env: { [BROWSER_ENV]: "/a", [CHROME_PATH_ENV]: "/b" }, exists: none })).toBe("/a");
    expect(findBrowser({ env: { [BROWSER_ENV]: "", [CHROME_PATH_ENV]: "/b" }, exists: none })).toBe("/b");
  });

  it("gives the first candidate that exists", () => {
    const found = findBrowser({
      env: { PATH: "/usr/bin:/usr/local/bin" },
      platform: "linux",
      exists: (path) => path === "/usr/local/bin/chromium" || path === "/usr/local/bin/microsoft-edge",
    });
    expect(found).toBe("/usr/local/bin/chromium");
  });

  it("gives undefined when no browser exists", () => {
    expect(findBrowser({ env: { PATH: "/usr/bin" }, platform: "linux", exists: none })).toBeUndefined();
  });
});
