---
"@procedures/mail": minor
---

`passwordEnv` of `mail.headers` names only a variable that starts with `IMAP_` or `MAIL_` (audit pass 2, roadmap O55).

MINOR (breaking, pre-1.0): before, `passwordEnv` could name any environment variable, and the caller also chose the host, the port and `secure`. Thus a caller could send any secret of the host (for example `GITHUB_TOKEN`) to its own server as the IMAP password. Now a name without the prefix `IMAP_` or `MAIL_` gets a validation error. The default `IMAP_PASSWORD` does not change.

The new export `MAIL_PASSWORD_ENV` is the pattern of the names.

Migration:

- A host that keeps the password in a variable with another name renames it, for example `GMAIL_APP_PASSWORD` to `IMAP_GMAIL_PASSWORD`, and gives the new name in `passwordEnv`.
- The site, MiniMongo, Graph and jarvis: no change. They do not call `mail.headers`.
