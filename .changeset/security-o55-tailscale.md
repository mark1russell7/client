---
"@procedures/tailscale": minor
---

`tailscale.run` takes its program from the host, never from the input (audit pass 2, roadmap O55).

MINOR (breaking, pre-1.0): the input `executable` is removed. An input with `executable` now gets a validation error. Before, the input let each caller of `tailscale.run` start any program of the host, with arguments that it chose.

- New: `createTailscaleModule({ executable })` and `createTailscaleProcedures({ executable })`. The order of the program stays the same: `executable` of the module, then `TAILSCALE_EXE`, then the Windows install folder, then `tailscale`.
- `tailscaleExecutable(explicit)` does not change.

Migration:

- jarvis: `packages/instance/src/remote.ts` sends `executable: bin` in the input of `tailscale.run`. Make the caller from `createTailscaleModule({ executable: bin })` in place of `tailscaleModule`, and remove `executable` from the input. Or set `TAILSCALE_EXE` from `JARVIS_TAILSCALE_BIN`.
- The site, MiniMongo and Graph: no change. They do not call `tailscale.run`.
