# @procedures/claude-cli

[![npm](https://img.shields.io/npm/v/@procedures/claude-cli?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/claude-cli)

```sh
npm install @procedures/claude-cli @procedures/client
```

One turn of the Claude Code CLI as a process that writes to a file. A host starts the turn, follows the file, gets normalised events and can stop the turn. The turn continues when the host stops, and a new host continues to read it.

A host registers the procedures with `createRegistry(claudeCliModule)`, or with `import "@procedures/claude-cli/register"` for the global registry. The package root and `./module` register nothing.

## The procedures

| Procedure | What it does | Effects |
|---|---|---|
| `claude.start` | It starts one turn as a detached process, and gives the process id and the output file. | reads `fs`, `network` and `process`, writes `fs`, `network`, `process` and `jobs` |
| `claude.read` | It reads the new events of a turn from a byte offset, and gives the offset for the next read. | reads `fs` and `jobs` |
| `claude.follow` | It streams the events of a turn until the result, or until the process ends without a result. | reads `fs` and `jobs` |
| `claude.cancel` | It stops the process tree of a turn by its process id. | reads and writes `jobs`, destructive |

- The agent of a turn can read and change files, start programs and use the network. So `claude.start` writes `process`.
- `claude.cancel` stops the process tree of the id that it gets. Give it only to callers that you trust.
- `claude.follow` declares `stream: { unbounded: true }`, because a turn has no time limit.

```ts
import "@procedures/claude-cli/register";

const turn = await client.call(["claude", "start"], { prompt: "Summarise the open issues", cwd: "/work/project" });
for await (const { event } of client.stream({ service: "claude", operation: "follow" }, { outputFile: turn.outputFile, pid: turn.pid })) {
  if (event.type === "text") console.log(event.text);
  if (event.type === "result") console.log(event.sessionId, event.costUsd);
}
```

## The turn

`startTurn(options)` starts this command, with argv and not through a shell:

```sh
claude [executableArgs] -p --output-format stream-json --verbose [args]
```

- The prompt goes into a file, and the process reads it on stdin. The output and the errors go into the output file. The process appends to that file.
- The process is detached, with no console window. On POSIX it has its own process group. The host holds no pipe to it, so a restart of the host does not stop it.
- `args` holds the other arguments of the CLI, for example `["--resume", sessionId]`, `["--model", name]` or `["--allowedTools", "Read"]`.
- The function `startTurn` gives the full environment of the process in `env`. The default is the environment of the host. Remove the secrets that the turn does not need.
- The input `env` of `claude.start` adds variables to the environment of the host.
- The result has `pid`, `outputFile`, `promptFile`, `offset` (the start of this turn in the output file), `command`, `args` and `startedAt`. Keep `pid`, `outputFile` and `offset` to read or stop the turn later.

## The events

`normalizeLine(line)` turns one line of stream-json into zero or more events. It is pure. The output file keeps each line unchanged, so a new version of the normaliser can read an old turn again.

| Event | The fields |
|---|---|
| `meta` | `subtype`, `sessionId`, `model`, `cwd`, `tools`, `permissionMode` |
| `text` | `text`: a text block of the assistant |
| `text-delta` | `text`: a part of a text block, with `--include-partial-messages` |
| `thinking` | `text`: a thinking block. The CLI gives empty thinking blocks in `-p` mode, and the normaliser drops them. |
| `tool-use` | `id`, `name`, `input` |
| `tool-result` | `toolUseId`, `output` (as text), `isError` |
| `result` | `subtype`, `isError`, `text`, `sessionId`, `costUsd`, `durationMs`, `turns`, `usage`, `errors` |
| `log` | `text`: a line that is not JSON. The CLI writes its errors and warnings as text. |
| `error` | `message`: the follow gives it when the process ends without a result. |

`preview(value, max)` gives a short text of a value, for a list of tool calls.

## Read and follow

- `readTurn({ outputFile, offset, pid })` reads the complete lines after `offset`. A partial last line stays for the next read. When the process has ended, the function also reads a last line without a line end.
- Each event has the byte offset after its line. Keep that offset, and a new host continues from it.
- `followTurn(options)` reads the file again every 250 ms (`pollMs`). It stops after the `result` event. When the process has ended without a result, it gives an `error` event and stops.
- Without `pid`, only the result or the signal stops the follow.

## Cancel

`cancelTurn(pid)` stops the process tree of a turn, also a turn that a previous host started.

- On Windows, it starts `taskkill /T /F /PID <pid>` through `runCommand` of `@procedures/shell`.
- On POSIX, it sends `SIGTERM` to the process group, then to the process when the group does not exist.
- It refuses the ids 0 and 1, and the ids of the host and its parent. A process that has ended gives `stopped: false`.

## The claude program

`findClaude(options)` uses the first of these:

1. The option or the input `executable`.
2. The environment variable `CLAUDE_BIN` of the host.
3. The `PATH`: `claude`, or `claude.exe` on Windows.
4. The folders of the native installer: `~/.local/bin` and `~/.claude/local`.

A batch file (`claude.cmd`) does not start without a shell. On Windows, use the native `claude.exe`, or give `node` as `executable` and the path of `cli.js` in `executableArgs`.

## The root of the files

A host with a root (`mark --fs-root`, `procedure-server --fs-root`, `MCP_FS_ROOT`) refuses `claude.start`. It starts the claude program, and the agent of the turn reaches each folder. `claude.read` and `claude.follow` read only an output file in the root. `claude.cancel` reaches no file.
