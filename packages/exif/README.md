# @procedures/exif

[![npm](https://img.shields.io/npm/v/@procedures/exif?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/exif)

When and where a JPEG photo was taken, from its EXIF block, without a dependency.

## Install

```bash
pnpm add @procedures/exif @procedures/client
```

A host registers the procedures with `createRegistry(exifModule)`, or with `import "@procedures/exif/register"` for the global registry. The package root and `./module` register nothing.

## Procedures

| Procedure | Effects | What it does |
| --- | --- | --- |
| `exif.read` | reads `fs` | Reads the time of the photo (with its offset when the camera writes one) and its GPS position. |

## Example

```ts
const { takenAt, lat, lon } = await client.exec(["exif", "read"], { path: "photo.jpg" });
```

## What it reads

It reads `DateTimeOriginal`, `OffsetTimeOriginal` and the GPS position, and nothing else. A photo without EXIF (a screenshot, an edited copy) gives an empty result. A position of 0, 0 is the value of a camera without a position, so the result does not include it.
