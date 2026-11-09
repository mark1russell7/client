// The root registers nothing: import "<package>/register", or give the module to createRegistry()
export * from "./module.js";
export * from "./types.js";
// The search and the render moved to @procedures/browser. The names stay here, so no caller breaks.
export {
  BROWSER_ENV,
  BROWSER_NAMES,
  CHROME_PATH_ENV,
  DEFAULT_TIMEOUT_MS,
  WINDOWS_BROWSER_NAMES,
  browserCandidates,
  findBrowser,
  isPdfFile,
  pdfArgs,
  renderPdf,
  type CommandRunner,
  type FindBrowserOptions,
  type RenderPdfOptions,
  type RenderPdfResult,
} from "@procedures/browser";
export { pdfRender } from "./procedures/pdf/index.js";
