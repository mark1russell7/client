# @procedures/tailscale

[![npm](https://img.shields.io/npm/v/@procedures/tailscale?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/tailscale)

The tailscale CLI as one procedure. It starts tailscale with argv, never through a shell.

## Install

```bash
pnpm add @procedures/tailscale @procedures/client
```

A host registers the procedures with `createRegistry(tailscaleModule)`, or with `import "@procedures/tailscale/register"` for the global registry. The package root and `./module` register nothing.

## Procedures

| Procedure | Effects | What it does |
| --- | --- | --- |
| `tailscale.run` | reads `network`, writes `network` and `process`, destructive | Runs a tailscale command (`status`, `ip`, `serve`, `up`, `down`). It gives the login address when tailscale prints one. |

## Example

```ts
const { json } = await client.exec(["tailscale", "run"], { path: ["status"], json: true });
```

## The program

The procedure uses `executable`, then `TAILSCALE_EXE`, then the Windows install folder, then `tailscale` on the `PATH`. The Windows installer does not put tailscale on the `PATH`.
