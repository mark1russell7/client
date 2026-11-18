---
"@procedures/client": patch
---

`peerModule` reads the manifest of a running peer through `procedure.manifest`. It gives a module with a stub for each entry, and each stub sends its call to the peer over HTTP. The module reads the address of the peer at each call, so a new port or token after a restart is no problem. `forwardedModule` makes the same stubs from a manifest and a call function of any transport. `HOST_NAMESPACES` names the namespaces that each host has (`client` and `procedure`): a forwarded module leaves them out by default.
