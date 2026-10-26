# @procedures/cli-kit

## 0.35.1

### Patch Changes

- Updated dependencies [9f0405d]
- Updated dependencies [f5c2407]
  - @procedures/client@0.35.1

## 0.35.0

### Patch Changes

- 5957933: PATCH: new export createProcedureCli, no break.
  
  New package `@procedures/cli-kit`: a command line for any procedure registry (roadmap O61, dedupe review F5). `createProcedureCli({ name, procedures, client, globals, format })` gives help, `--json`, `--data`, questions for missing arguments, `@<file>` input, short flags from `meta.shorts`, and a format hook for each procedure. Its `run(argv)` gives the exit code.
  
  `mark` now uses the parts of the kit: the parse of the command line, the help, the questions, the output and the failure rule. Its commands, flags, messages and exit codes do not change. The exports of `@procedures/mark` stay the same.
- @procedures/client@0.35.0
