# @procedures/mail

## 0.33.0

### Patch Changes

- @procedures/client@0.33.0

## 0.32.0

### Minor Changes

- 61c667a: `passwordEnv` of `mail.headers` names only a variable that starts with `IMAP_` or `MAIL_` (audit pass 2, roadmap O55).
  
  MINOR (breaking, pre-1.0): before, `passwordEnv` could name any environment variable, and the caller also chose the host, the port and `secure`. Thus a caller could send any secret of the host (for example `GITHUB_TOKEN`) to its own server as the IMAP password. Now a name without the prefix `IMAP_` or `MAIL_` gets a validation error. The default `IMAP_PASSWORD` does not change.
  
  The new export `MAIL_PASSWORD_ENV` is the pattern of the names.
  
  Migration:
  
  - A host that keeps the password in a variable with another name renames it, for example `GMAIL_APP_PASSWORD` to `IMAP_GMAIL_PASSWORD`, and gives the new name in `passwordEnv`.
  - The site, MiniMongo, Graph and jarvis: no change. They do not call `mail.headers`.

### Patch Changes

- @procedures/client@0.32.0

## 0.31.0

### Patch Changes

- @procedures/client@0.31.0

## 0.30.0

### Patch Changes

- @procedures/client@0.30.0

## 0.29.0

### Patch Changes

- @procedures/client@0.29.0

## 0.28.1

### Patch Changes

- 345c740: `mail.parse` gives U+FFFD for a numeric HTML entity above U+10FFFF. Before, such an entity threw a `RangeError` (second code audit, roadmap O57).
- 497e32f: New configuration paths for the five breaks of the second code audit (roadmap O55, decision D35). Each old input keeps working, with a deprecation notice.
  
  PATCH: new options and exports, and deprecation notices. No input that works today gets an error. Each notice is a `DeprecationWarning` of Node, one time in each process, and it names the new path.
  
  - `@procedures/tailscale` adds `createTailscaleModule({ executable })` and `createTailscaleProcedures({ executable })`. The order of the program is the input `executable`, then the option, then `TAILSCALE_EXE`, then the Windows install folder, then `tailscale`. The input `executable` is `@deprecated`, with the notice `PROCEDURES_TAILSCALE_EXECUTABLE_INPUT`.
  - `@procedures/restic` adds the option `executable` of `createResticModule()` and `createResticProcedures()`. The input `executable` of `restic.run` wins over it, as before. The input is `@deprecated`, with the notice `PROCEDURES_RESTIC_EXECUTABLE_INPUT`.
  - `@procedures/mail` exports `MAIL_PASSWORD_ENV`, the pattern of the names of `passwordEnv`: `IMAP_` or `MAIL_` and more. Another name still works, with the notice `PROCEDURES_MAIL_PASSWORD_ENV`.
  - `@procedures/notify` exports `NOTIFY_TOKEN_ENV`, the pattern of the names of `tokenEnv`: `NTFY_` or `NOTIFY_` and more. Another name still works, with the notice `PROCEDURES_NOTIFY_TOKEN_ENV`.
  
  The breaks that come next. Each break is its own MINOR, and the group is released after each one.
  
  1. 0.29.0, the host fetch policy: `weather.forecast` and the `mcpHostModules` of `geo` and `ics` refuse a loopback, private or link-local host with `FORBIDDEN`. The option `warnOnRefusal` of `createHostFetch()` goes away.
     - The site, MiniMongo and Graph: no change. They do not call these procedures through a registry of Node.
     - jarvis: no change. `packages/pipeline` calls the function `geocode()` of `@procedures/geo`, not the procedure.
     - Another host with a private server gives `createWeatherModule({ fetch: createHostFetch({ allow: [...] }) })`, or the same for `createGeoModule()` and `createIcsModule()`, before the bundle.
  2. 0.30.0, `tailscale.run` (#182): the input `executable` gets a validation error.
     - jarvis: `packages/instance/src/remote.ts` sends `executable: bin`. Make the caller from `createTailscaleModule({ executable: bin })` in place of `tailscaleModule`, and remove `executable` from the input. Or set `TAILSCALE_EXE` from `JARVIS_TAILSCALE_BIN`.
     - The site, MiniMongo and Graph: no change. They do not call `tailscale.run`.
  3. 0.31.0, `restic.run` (#183): the input `executable` gets a validation error.
     - jarvis: no change. It calls `runRestic()` with the result of `findRestic()`, not `restic.run`.
     - The site, MiniMongo and Graph: no change. They do not call `restic.run`.
     - Another host gives the program to `createResticModule({ executable })`, or sets `RESTIC_EXE`.
  4. 0.32.0, `mail.headers` (#184): a `passwordEnv` without the prefix `IMAP_` or `MAIL_` gets a validation error.
     - The site, MiniMongo, Graph and jarvis: no change. They do not call `mail.headers`.
     - Another host renames the variable, for example `GMAIL_APP_PASSWORD` to `IMAP_GMAIL_PASSWORD`, and gives the new name in `passwordEnv`.
  5. 0.33.0, `notify.send` (#185): a `tokenEnv` without the prefix `NTFY_` or `NOTIFY_` gets a validation error.
     - The site, MiniMongo, Graph and jarvis: no change. They do not give `tokenEnv`.
     - Another host renames the variable, for example `PHONE_TOKEN` to `NTFY_TOKEN`, and gives the new name in `tokenEnv`.
  
  Migration now: a host that gets a notice changes to the new path that the notice names. The notice then stops, and the next break does not change the host.
- Updated dependencies [345c740]
- Updated dependencies [984c13b]
- Updated dependencies [21dc858]
  - @procedures/client@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [06694d7]
  - @procedures/client@0.28.0

## 0.27.8

### Patch Changes

- Updated dependencies [1834a5e]
  - @procedures/client@0.27.8

## 0.27.7

### Patch Changes

- @procedures/client@0.27.7

## 0.27.6

### Patch Changes

- Updated dependencies [d322bef]
  - @procedures/client@0.27.6

## 0.27.5

### Patch Changes

- @procedures/client@0.27.5

## 0.27.4

### Patch Changes

- Updated dependencies [8970a1e]
  - @procedures/client@0.27.4

## 0.27.3

### Patch Changes

- @procedures/client@0.27.3

## 0.27.2

### Patch Changes

- Updated dependencies [7bc4c6d]
  - @procedures/client@0.27.2

## 0.27.1

### Patch Changes

- Updated dependencies [146d38e]
  - @procedures/client@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies [7eac8b5]
  - @procedures/client@0.27.0

## 0.26.2

### Patch Changes

- @procedures/client@0.26.2

## 0.26.1

### Patch Changes

- @procedures/client@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [a16af64]
  - @procedures/client@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [75bff3b]
- Updated dependencies [16562ee]
  - @procedures/client@0.25.0

## 0.24.1

### Patch Changes

- Updated dependencies [2735505]
  - @procedures/client@0.24.1

## 0.24.0

### Patch Changes

- @procedures/client@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [f20beb1]
- Updated dependencies [71091a5]
  - @procedures/client@0.23.0

## 0.22.1

### Patch Changes

- Updated dependencies [c931188]
  - @procedures/client@0.22.1

## 0.22.0

### Patch Changes

- @procedures/client@0.22.0

## 0.21.0

### Patch Changes

- @procedures/client@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [5f49860]
  - @procedures/client@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [5cb934d]
  - @procedures/client@0.19.0

## 0.18.1

### Patch Changes

- Updated dependencies [d69c8cb]
- Updated dependencies [0379278]
  - @procedures/client@0.18.1

## 0.18.0

### Patch Changes

- Updated dependencies [5e68b6a]
  - @procedures/client@0.18.0

## 0.17.4

### Patch Changes

- @procedures/client@0.17.4

## 0.17.3

### Patch Changes

- @procedures/client@0.17.3

## 0.17.2

### Patch Changes

- Updated dependencies [8b7e20c]
  - @procedures/client@0.17.2

## 0.17.1

### Patch Changes

- Updated dependencies [1ceb990]
  - @procedures/client@0.17.1

## 0.17.0

### Patch Changes

- @procedures/client@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [deada4b]
  - @procedures/client@0.16.0

## 0.15.1

### Patch Changes

- Updated dependencies [c78da2d]
- Updated dependencies [d99b2d5]
- Updated dependencies [534e4ea]
- Updated dependencies [44fdd60]
  - @procedures/client@0.15.1

## 0.15.0

### Patch Changes

- Updated dependencies [c7198ca]
  - @procedures/client@0.15.0

## 0.14.1

### Patch Changes

- Updated dependencies [85999c1]
- Updated dependencies [fc968f6]
- Updated dependencies [dc7a462]
- Updated dependencies [e091108]
- Updated dependencies [073e4c3]
- Updated dependencies [6969637]
  - @procedures/client@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [217a90f]
  - @procedures/client@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [3a235b9]
  - @procedures/client@0.13.2

## 0.13.1

### Patch Changes

- @procedures/client@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [e2fe006]
  - @procedures/client@0.13.0

## 0.12.2

### Patch Changes

- @procedures/client@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [b89e3fe]
  - @procedures/client@0.12.1

## 0.12.0

### Patch Changes

- @procedures/client@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [37c96a3]
  - @procedures/client@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [254ee7b]
  - @procedures/client@0.10.0

## 0.9.2

### Patch Changes

- @procedures/client@0.9.2

## 0.9.1

### Patch Changes

- Updated dependencies [61d60c6]
- Updated dependencies [79f750a]
- Updated dependencies [d0c9856]
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [8bb469c]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1

## 0.8.0

### Patch Changes

- Updated dependencies [4b09a03]
- Updated dependencies [4b09a03]
- Updated dependencies [aa6e3aa]
- Updated dependencies [698e24d]
- Updated dependencies [4b09a03]
- Updated dependencies [600c497]
- Updated dependencies [7c2e7f7]
- Updated dependencies [90ea741]
- Updated dependencies [c4cfa34]
- Updated dependencies [d25805a]
  - @procedures/client@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/client@0.7.0

## 0.6.0

### Patch Changes

- @procedures/client@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0

## 0.3.0

### Minor Changes

- 5e2ba76: New package: `mail.parse` reads the headers, the addresses and the text of a raw message. `mail.headers` gives the headers of recent IMAP messages, read only.

### Patch Changes

- e2a3f96: `@procedures/mail` accepts each imapflow 2 version from 2.2.1 (`^2.2.1`, before `~2.2.1`). An application that uses a newer imapflow 2 itself then installs only one copy.
- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0
