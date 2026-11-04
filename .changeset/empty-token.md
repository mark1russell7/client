---
"@procedures/client": patch
---

Security fix. `tokenMatches` accepted an empty presented token when the expected token was empty, so a server with `token: ""` admitted a request with an empty bearer. An empty expected token now matches nothing, so `token: ""` means "refuse each network request". The comparison now loops over the presented token, so its time depends only on what the caller sent, as its doc comment says. `MCP_HTTP_TOKEN` set and empty is now an error at the start of the HTTP face, because the server otherwise started with no token. PATCH: the change affects only a server that is open by mistake.
