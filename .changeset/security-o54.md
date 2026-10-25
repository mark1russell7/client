---
"@procedures/client": patch
"@procedures/better-auth": patch
"@procedures/llm": patch
"@procedures/mark": patch
"@procedures/procedure": patch
---

Fixes for the findings of the first code scan (roadmap O54).

PATCH: bug fixes. A caller that used the documented behavior sees no change.

- The route of `HttpServerTransport` now matches each character of `basePath` only as itself. Before, the route escaped only `/`, so a backslash or another special character of a regular expression in the base path changed the paths that the route took, and a parenthesis made the constructor throw. The test in `route.test.ts` pins this.
- `betterAuthHandler()` and `createBrowserAuth()` of `@procedures/better-auth` remove the slashes at the end of `basePath` and `baseURL` with a loop, not with a regular expression. A long base path now takes linear time.
- `@procedures/llm` removes the slashes at the end of `baseUrl` with a loop. `parseAnswer()` removes a code fence around the answer with a small parser, not with a regular expression. The results for each valid answer stay the same, and a long answer now takes linear time.
- `mark` reads a number and a negative number with regular expressions that have one match for each text. The numbers that `mark` takes stay the same, and a long run of digits now takes linear time.
- `procedure.new` of `@procedures/procedure` escapes each special character of a variable name in its search for the array of the procedures. It reads the names of an import without a regular expression that takes polynomial time on a long run of spaces.
- The lockfile now resolves `zod` 4.6.7 and `body-parser` 2.4.0 (through `express`), which fix two published advisories. The dependency ranges do not change.
