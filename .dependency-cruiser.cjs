// The import boundaries of the procedures stack (roadmap CLI-83). They guard invariant I9 of
// packages/documentation/ARCHITECTURE.md. Start the check with `pnpm check:boundaries`, after
// `pnpm build`: an import of another package resolves through its exports map to its dist/ folder.
// The rules are in scripts/lib/boundaries.cjs, and their tests in scripts/check-boundaries.test.mjs.
//
// The rule "a browser entry imports no Node built-in" is not here: scripts/check-browser-entries.mjs
// (CLI-39) examines it.

const { boundaries } = require("./scripts/lib/boundaries.cjs");

module.exports = boundaries(__dirname);
