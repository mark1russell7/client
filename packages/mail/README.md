# @procedures/mail

[![npm](https://img.shields.io/npm/v/@procedures/mail?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/mail)

Email procedures: the headers, the addresses and the text of a raw message (MIME), and the headers of the recent messages of an IMAP mailbox.

## Install

```bash
pnpm add @procedures/mail @procedures/client
```

A host registers the procedures with `createRegistry(mailModule)`, or with `import "@procedures/mail/register"` for the global registry. The package root and `./module` register nothing.

## Procedures

| Procedure | Effects | What it does |
| --- | --- | --- |
| `mail.parse` | none | Reads the headers, the addresses and the text of a raw RFC 822 message. It reads multipart, quoted-printable, base64 and HTML-only messages. |
| `mail.headers` | reads `network` | Gives the headers of the recent messages of an IMAP mailbox. It opens the mailbox read only, so no message becomes read. |

## Example

```ts
// IMAP_PASSWORD holds the password (an app password for Gmail)
const { messages } = await client.exec(["mail", "headers"], {
  host: "imap.gmail.com",
  user: "me@example.org",
  sinceDays: 2,
});
```

## The password

The password of `mail.headers` is never an input, so no log of a call records it. The procedure reads it from the environment variable that `passwordEnv` names (default: `IMAP_PASSWORD`).

The name starts with `IMAP_` or `MAIL_`, for example `IMAP_PASSWORD` or `MAIL_WORK_PASSWORD`. The procedure refuses another name. The caller chooses the host, so another name lets it send a secret of the host, for example `GITHUB_TOKEN`, to its own server.
