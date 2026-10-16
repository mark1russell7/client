# @procedures/notify

[![npm](https://img.shields.io/npm/v/@procedures/notify?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/notify)

Push notifications through ntfy (the public server or your own). Each phone that subscribes to the topic gets the message.

## Install

```bash
pnpm add @procedures/notify @procedures/client
```

A host registers the procedures with `createRegistry(notifyModule)`, or with `import "@procedures/notify/register"` for the global registry. The package root and `./module` register nothing.

## Procedures

| Procedure | Effects | What it does |
| --- | --- | --- |
| `notify.send` | writes `network`, not destructive | Sends a notification with a title, a priority, tags and a tap address. |

## Example

```ts
await client.exec(["notify", "send"], { topic: "my-long-random-topic", title: "Backup done", message: "3 files" });
```

## Privacy

On the public server, anyone who knows a topic can read its messages. Use a long random topic name, and do not send private content. For a protected topic, `tokenEnv` names the environment variable with the access token.
