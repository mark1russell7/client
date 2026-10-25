---
"@procedures/notify": minor
---

`tokenEnv` of `notify.send` names only a variable that starts with `NTFY_` or `NOTIFY_` (audit pass 2, roadmap O55).

MINOR (breaking, pre-1.0): before, `tokenEnv` could name any environment variable, and the caller also chose the server. Thus a caller could send any secret of the host (for example `GITHUB_TOKEN`) to its own server as the access token. Now a name without the prefix `NTFY_` or `NOTIFY_` gets a validation error.

The new export `NOTIFY_TOKEN_ENV` is the pattern of the names.

Migration:

- A host that keeps the token in a variable with another name renames it, for example `PHONE_TOKEN` to `NTFY_TOKEN`, and gives the new name in `tokenEnv`.
- The site, MiniMongo, Graph and jarvis: no change. They do not give `tokenEnv`.
