# @procedures/bundle-assistant

[![npm](https://img.shields.io/npm/v/@procedures/bundle-assistant?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/bundle-assistant)

The opt-in tools of the personal assistant for an MCP host. The bundle has the procedures of `@procedures/ics`, `@procedures/mail`, `@procedures/geo`, `@procedures/weather` and `@procedures/exif`.

## Use

The dev-tools server of `@procedures/mcp-dev-tools` loads the bundles of `MCP_BUNDLES`. Add this bundle to the default bundle:

```sh
MCP_BUNDLES=@procedures/bundle-mcp,@procedures/bundle-assistant mark mcp
```

## The tools

| Tool | What it does |
|---|---|
| `ics.parse`, `ics.occurrences` | They read a calendar file and its repeated events. They are pure. |
| `ics.write` | It writes a calendar file from events. It is pure. |
| `mail.parse` | It reads the headers and the text of a message. It is pure. |
| `geo.geocode`, `geo.route` | They read one public service each. |
| `geo.distance`, `geo.geohash` | They give the distance between two points and the geohash of a point. They are pure. |
| `weather.forecast` | It reads one public service. |
| `exif.read` | It reads the date and the place of a photo on the host. |

These procedures are not tools:

- `ics.fetch` fetches any URL, so a tool call can carry data out in the URL.
- `mail.headers` reads a private mailbox.
- `notify.send`, `restic.run` and `tailscale.run` are not in the bundle. The first one posts to any topic of a public server, and the others run destructive commands.

A test pins the list of tools. Each tool changes nothing.
