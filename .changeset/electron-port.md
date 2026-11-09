---
"@procedures/client": patch
---

The browser entry exports `electronPortOf` and the type `MainPortLike`. The function gives the `PortLike` of a `MessagePortMain` of Electron, whose listener gets an event with the message in `data`. An Electron app can delete its own adapter.
