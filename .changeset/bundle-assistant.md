---
"@procedures/bundle-assistant": minor
---

The opt-in tools of the personal assistant (roadmap R48). `@procedures/bundle-assistant` gives an MCP host the procedures of `ics`, `mail`, `geo`, `weather` and `exif`. The tools are `ics.parse`, `ics.occurrences`, `mail.parse`, `geo.geocode`, `geo.route`, `weather.forecast` and `exif.read`. `ics.fetch` and `mail.headers` are not tools: the first one can carry data out in a URL, and the second one reads a private mailbox. A host opts in with `MCP_BUNDLES=@procedures/bundle-mcp,@procedures/bundle-assistant`.
