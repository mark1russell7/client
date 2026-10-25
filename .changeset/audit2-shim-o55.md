---
"@procedures/tailscale": patch
"@procedures/restic": patch
"@procedures/mail": patch
"@procedures/notify": patch
---

New configuration paths for the five breaks of the second code audit (roadmap O55, decision D35). Each old input keeps working, with a deprecation notice.

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
