// The package has no procedures. It gives functions only: the search, the run and the renders.
export * from "./browser.js";
export { DEFAULT_TIMEOUT_MS, type CommandRunner, type HeadlessOptions, type RenderResult } from "./run.js";
export { isPdfFile, pdfArgs, renderPdf, type RenderPdfOptions, type RenderPdfResult } from "./pdf.js";
export * from "./screenshot.js";
// The bookmarks files of Chrome, Edge and Chromium: the parse (also on the browser entry ./bookmarks) and the search on the disk
export * from "./bookmarks.js";
export * from "./profiles.js";
