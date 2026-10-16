# @procedures/bundle-assistant

## 0.4.0

### Minor Changes

- 0f1d06e: Three new tools: `ics.write`, `geo.distance` and `geo.geohash`. They are pure, so they change nothing and read no network. The test of the bundle pins the new list of tools.

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [0f1d06e]
- Updated dependencies [0f1d06e]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0
  - @procedures/geo@0.4.0
  - @procedures/ics@0.4.0
  - @procedures/exif@0.4.0
  - @procedures/mail@0.4.0
  - @procedures/weather@0.4.0

## 0.3.0

### Minor Changes

- 4055a3d: The opt-in tools of the personal assistant (roadmap R48). `@procedures/bundle-assistant` gives an MCP host the procedures of `ics`, `mail`, `geo`, `weather` and `exif`. The tools are `ics.parse`, `ics.occurrences`, `mail.parse`, `geo.geocode`, `geo.route`, `weather.forecast` and `exif.read`. `ics.fetch` and `mail.headers` are not tools: the first one can carry data out in a URL, and the second one reads a private mailbox. A host opts in with `MCP_BUNDLES=@procedures/bundle-mcp,@procedures/bundle-assistant`.

### Patch Changes

- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [2a754ee]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [e2a3f96]
- Updated dependencies [540f8d9]
- Updated dependencies [5e2ba76]
- Updated dependencies [5e2ba76]
- Updated dependencies [5e2ba76]
- Updated dependencies [5e2ba76]
- Updated dependencies [5e2ba76]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0
  - @procedures/geo@0.3.0
  - @procedures/mail@0.3.0
  - @procedures/exif@0.3.0
  - @procedures/ics@0.3.0
  - @procedures/weather@0.3.0
