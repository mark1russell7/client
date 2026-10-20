# The procedures subject of the harness

This folder is the procedures subject of the harness of [`systems`](https://github.com/mark1russell7/systems) (item CLI-33, decision D16). The WS and WST cells of the harness run the WebSocket client and the procedures server of `@procedures/client` under real network faults. This repository owns the image of that subject, so the cells examine the client of each commit.

## The files

| File | Content |
|---|---|
| `Dockerfile` | The image of the subject. It builds `@procedures/client` from the lockfile of this repository. |
| `client-ws.mjs` | The `client` program: the `WebSocketTransport` of the client, with the JSON lines of the harness. |
| `server-ws.mjs` | The `server` program: `ProcedureServer` and `WebSocketServerTransport` on the `http.Server` of Node. |
| `lines.mjs` | The JSON lines, the command line and the version of the package, for the two programs. |
| `subject.json` | The subject as data: the `Subject` type of the harness, with a `build` image. |

The programs are the programs of the subject that the harness shipped before (`harness/image/procedures` of `systems`). They write the same lines and take the same flags. Two parts are different:

- The programs run the `@procedures/client` of this checkout, not a release from npm.
- The server is `ProcedureServer`, the server of each procedures host. The old program used `Server`, its base class.

## The image

The context of the build is the root of a checkout of this repository. `image.files` of `subject.json` names the files that the harness copies into the context.

1. The first stage installs `@procedures/client` with `pnpm install --frozen-lockfile` and builds it.
2. `pnpm deploy --prod` writes the package with only its production dependencies to `/opt/subject`.
3. The second stage is that folder, with the three programs beside the `package.json` of the client.

`import "@procedures/client"` in a program is thus a self-reference of the package. `import "ws"` finds the one copy of `ws` that the client uses. The image is approximately 22 MB above its base.

The harness refuses a build with a `FROM` that no digest pins, and a `package.json` without a lockfile. Each `FROM` of the `Dockerfile` names a digest. The root `pnpm-lock.yaml` locks each `package.json` of the context. The base is the Node 24.21.0 image of the subject that the harness ships, with the same digest. Thus a difference between the two subjects comes from the release, not from Node.

The readiness of a target is the line `listening` of the server: the harness waits for it. The server has no health route. The probes of a host are a job of the host (`packages/documentation/SERVER-LAYERS.md`).

## The workflow

The workflow `.github/workflows/harness.yml` starts the cells on this subject. It starts each night, by hand, and on a pull request that changes this folder or the WebSocket code of the client. A push does not start it, because a run takes approximately 40 minutes.

1. Each shard checks out `systems` at the commit `SYSTEMS_REF` of the workflow. The cells run from the source of `systems`, because the catalog of the cells is not on npm.
2. The workflow sets `image.context` of `subject.json` to the folder of the checkout. It gives the subject to the cells as `CELLS_SUBJECT`.
3. The harness builds the image, then starts the cells whose names match `only`. The default `^WS` gives the WS and the WST cells.
4. Each shard uploads its raw records, its `summary.ndjson` and `runner.txt` as the artifact `cells-<shard>`.
5. The job `verdicts` writes a table of the verdicts. A cell that fails, or that is inconclusive, fails the job. A cell that is `measured` has no band, and it passes.

To start the workflow by hand, use this command. `^WS ` with a space gives only the WS cells:

```sh
gh workflow run harness.yml -R mark1russell7/client -f only='^WS ' -f shards=4
```

With the input `systems`, the workflow uses another commit of `systems`, for example a change of the harness before it merges. To change the default commit, change `SYSTEMS_REF` in the workflow.

## A dispatch from systems

`cells.yml` of `systems` takes a subject as JSON in its input `subject`. A dispatch from another repository cannot read this checkout, so it gives a pinned image in place of the build:

```json
{
  "name": "procedures",
  "image": { "kind": "pinned", "image": "ghcr.io/mark1russell7/procedures-subject:<version>@sha256:<digest>" },
  "base": "node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1",
  "programs": {
    "client": ["node", "/opt/subject/client-ws.mjs"],
    "server": ["node", "/opt/subject/server-ws.mjs"]
  }
}
```

The fields `base` and `programs` are the fields of `subject.json`. Only `image` changes. No workflow of this repository pushes that image yet: the item that publishes it is open. Until then, a job of `systems` can check out this repository at a commit. It then gives the `build` subject of `subject.json`, with `image.context` at that checkout.
